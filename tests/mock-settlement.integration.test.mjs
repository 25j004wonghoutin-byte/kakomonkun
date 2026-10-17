import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {withMockDb} from "./helpers/mock-db.mjs";

async function pending(f,actor,selected=0){
  const attempt=await f.db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId:actor.id,startRequestId:randomUUID(),attemptNo:1,startedAt:f.now(),expiresAt:new Date(+f.now()+5400000),totalQuestions:60}});
  if(selected)await f.db.mockAnswer.createMany({data:f.questions.slice(0,selected).map(q=>({attemptId:attempt.id,mockExamId:f.mockExamId,mockQuestionId:q.id,selectedChoiceId:q.correctChoiceId,answeredAt:f.now()}))});
  return attempt;
}

test("final ranks are frozen only after grading; rewards are per-user atomic, retryable and bounded",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:600000},async t=>{
  const path=new URL("../src/lib/mock-exams/settlement.ts",import.meta.url);assert.ok(existsSync(path),"deadline settlement service must exist");
  const {settleMockExamBatch:settle}=await import(path.href);
  const {rewardMockRanking:reward}=await import("../src/lib/mock-exams/rewards.ts");
  await withMockDb({examCode:"fe",month:"2041-01",userCount:6},async f=>{
    for(const [i,count] of [50,50,40,30,1].entries())await pending(f,f.actors[i],count);
    await t.test("before the monthly deadline even an expired attempt cannot finalize rankings",async()=>{
      f.setNow(new Date("2041-01-24T23:59:59.999+09:00"));
      await assert.rejects(settle(f.db,f.mockExamId,f.clock),e=>e.status===409&&e.code==="settlement_not_due");
      assert.equal(await f.db.monthlyRanking.count({where:{mockExamId:f.mockExamId}}),0);
      assert.equal(await f.db.pointTransaction.count({where:{userId:{in:f.actors.map(a=>a.id)}}}),0);
    });
    let ranks;
    await t.test("at close all pending grades precede a single immutable best-score snapshot",async()=>{
      f.setNow(new Date("2041-01-25T00:00:00+09:00"));
      const broken=f.db.$extends({query:{monthlyRanking:{async createMany({args,query}){await query(args);throw new Error("Fault after rank snapshot insertion");}}}});
      await assert.rejects(settle(broken,f.mockExamId,f.clock),/Fault after rank snapshot insertion/);
      assert.equal(await f.db.monthlyRanking.count({where:{mockExamId:f.mockExamId}}),0);
      assert.equal((await f.db.mockExam.findUniqueOrThrow({where:{id:f.mockExamId}})).rankingFinalizedAt,null);
      const result=await settle(f.db,f.mockExamId,f.clock);
      assert.deepEqual(result,{phase:"ranked",remaining:5});
      ranks=await f.db.monthlyRanking.findMany({where:{mockExamId:f.mockExamId},orderBy:[{rankNo:"asc"},{userId:"asc"}]});
      assert.deepEqual(ranks.map(r=>r.rankNo),[1,1,3,4,5]);assert.ok(ranks.every(r=>r.isFinal));
      const exam=await f.db.mockExam.findUniqueOrThrow({where:{id:f.mockExamId}});assert.ok(exam.rankingFinalizedAt);assert.equal(exam.rewardsCompletedAt,null);
      assert.equal(await f.db.studentActivityDay.count({where:{userId:{in:f.actors.map(a=>a.id)}}}),0);
      assert.equal(await f.db.mockAttempt.count({where:{mockExamId:f.mockExamId,status:"in_progress"}}),0);
    });
    await t.test("parallel rank-one payouts pay 150 once and preserve existing participation",async()=>{
      const rank=ranks.find(r=>r.userId===f.actor.id);
      const results=await Promise.all([reward(f.db,rank.id,f.clock),reward(f.other,rank.id,f.clock)]);
      assert.deepEqual(results.map(r=>r.rewardPoints),[150,150]);assert.equal(results.filter(r=>r.alreadyProcessed).length,1);
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actor.id}})).totalPoints,170);
      assert.equal(await f.db.pointTransaction.count({where:{userId:f.actor.id,reason:"mock_rank_reward",sourceType:"monthly_ranking",sourceId:rank.id}}),1);
    });
    await t.test("failure after eligibility notification rolls back points, ledger, unlock and processed marker",async()=>{
      const actor=f.actors[2],rank=ranks.find(r=>r.userId===actor.id);
      await f.db.studentActivityDay.createMany({data:Array.from({length:365},(_,i)=>({userId:actor.id,activityDate:new Date(Date.UTC(2040,0,1+i)),hasAnswered:true,firstSeenAt:new Date(Date.UTC(2040,0,1+i)),lastSeenAt:new Date(Date.UTC(2040,0,1+i))}))});
      const title=await f.db.title.findUniqueOrThrow({where:{catalogKey:"v1-066"}});
      const broken=f.db.$extends({query:{notification:{async createMany({args,query}){await query(args);throw new Error("Fault after reward eligibility notification");}}}});
      await assert.rejects(reward(broken,rank.id,f.clock),/Fault after reward eligibility notification/);
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:actor.id}})).totalPoints,20);
      assert.equal(await f.db.pointTransaction.count({where:{userId:actor.id,reason:"mock_rank_reward"}}),0);
      assert.equal((await f.db.monthlyRanking.findUniqueOrThrow({where:{id:rank.id}})).rewardProcessedAt,null);
      assert.equal(await f.db.userTitleUnlock.count({where:{userId:actor.id,titleId:title.id}}),0);
      assert.equal(await f.db.notification.count({where:{recipientId:actor.id,titleId:title.id}}),0);
      assert.deepEqual(await reward(f.db,rank.id,f.clock),{rewardPoints:75,alreadyProcessed:false});
      assert.deepEqual(await reward(f.db,rank.id,f.clock),{rewardPoints:75,alreadyProcessed:true});
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:actor.id}})).totalPoints,95);
      assert.equal(await f.db.notification.count({where:{recipientId:actor.id,titleId:title.id}}),1);
      assert.equal(await f.db.studentActivityDay.count({where:{userId:actor.id}}),365);
    });
    await t.test("resume processes only unpaid rows, then marks completion without replacing snapshot IDs",async()=>{
      await f.db.user.update({where:{id:f.actors[1].id},data:{displayName:"変更後の名前",status:"inactive"}});
      const before=ranks.map(r=>[r.id,r.rankNo,r.bestAttemptId,Number(r.mockScore)]);
      assert.deepEqual(await settle(f.db,f.mockExamId,f.clock),{phase:"complete",remaining:0});
      assert.deepEqual(await settle(f.other,f.mockExamId,f.clock),{phase:"complete",remaining:0});
      const after=await f.db.monthlyRanking.findMany({where:{mockExamId:f.mockExamId},orderBy:[{rankNo:"asc"},{userId:"asc"}]});
      assert.deepEqual(after.map(r=>[r.id,r.rankNo,r.bestAttemptId,Number(r.mockScore)]),before);
      assert.deepEqual(after.map(r=>r.rewardPoints),[150,150,75,0,0]);assert.ok(after.every(r=>r.rewardProcessedAt));
      assert.ok((await f.db.mockExam.findUniqueOrThrow({where:{id:f.mockExamId}})).rewardsCompletedAt);
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actors[5].id}})).totalPoints,0);
      assert.equal(await f.db.monthlyRanking.count({where:{userId:f.actors[5].id}}),0);
      assert.equal(await f.db.pointTransaction.count({where:{userId:{in:f.actors.map(a=>a.id)},reason:"mock_rank_reward"}}),3);
    });
  });
  await t.test("distinct first second and third places receive exactly 150, 100 and 75 points",async()=>{
    await withMockDb({examCode:"fe",month:"2041-06",userCount:3},async f=>{
      for(const [i,count] of [60,59,58].entries())await pending(f,f.actors[i],count);
      f.setNow(new Date("2041-06-25T00:00:00+09:00"));await settle(f.db,f.mockExamId,f.clock);await settle(f.db,f.mockExamId,f.clock);
      const rows=await f.db.monthlyRanking.findMany({where:{mockExamId:f.mockExamId},orderBy:{rankNo:"asc"}});
      assert.deepEqual(rows.map(row=>row.rewardPoints),[150,100,75]);
      for(const [i,points] of [170,120,95].entries())assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actors[i].id}})).totalPoints,points);
    });
  });
  for(const [month,participants] of [["2041-02",2],["2041-03",1],["2041-04",0]])await t.test(`${participants} zero-score participants finalize without hidden minimum score or participant limits`,async()=>{
    await withMockDb({examCode:"fe",month,userCount:3},async f=>{
      for(const actor of f.actors.slice(0,participants))await pending(f,actor);
      f.setNow(new Date(`${month}-25T00:00:00+09:00`));
      await settle(f.db,f.mockExamId,f.clock);await settle(f.db,f.mockExamId,f.clock);await settle(f.other,f.mockExamId,f.clock);
      const rows=await f.db.monthlyRanking.findMany({where:{mockExamId:f.mockExamId}});
      assert.equal(rows.length,participants);assert.ok(rows.every(r=>r.rankNo===1&&Number(r.mockScore)===0&&r.rewardPoints===150&&r.rewardProcessedAt));
      assert.equal(await f.db.pointTransaction.count({where:{userId:{in:f.actors.map(a=>a.id)},reason:"mock_rank_reward"}}),participants);
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actors[2].id}})).totalPoints,0);
      const exam=await f.db.mockExam.findUniqueOrThrow({where:{id:f.mockExamId}});assert.ok(exam.rankingFinalizedAt);assert.ok(exam.rewardsCompletedAt);
    });
  });
  await t.test("26 due attempts and payouts advance in bounded batches without early completion",async()=>{
    await withMockDb({examCode:"fe",month:"2041-05",userCount:26},async f=>{
      await f.db.mockAttempt.createMany({data:f.actors.map(actor=>({mockExamId:f.mockExamId,userId:actor.id,startRequestId:randomUUID(),attemptNo:1,startedAt:f.now(),expiresAt:new Date(+f.now()+5400000),totalQuestions:60}))});
      f.setNow(new Date("2041-05-25T00:00:00+09:00"));
      assert.deepEqual(await settle(f.db,f.mockExamId,f.clock),{phase:"grading",remaining:1});
      assert.equal((await f.db.mockExam.findUniqueOrThrow({where:{id:f.mockExamId}})).rankingFinalizedAt,null);
      assert.deepEqual(await settle(f.db,f.mockExamId,f.clock),{phase:"ranked",remaining:26});
      assert.deepEqual(await settle(f.db,f.mockExamId,f.clock),{phase:"ranked",remaining:1});
      assert.equal((await f.db.mockExam.findUniqueOrThrow({where:{id:f.mockExamId}})).rewardsCompletedAt,null);
      assert.deepEqual(await settle(f.db,f.mockExamId,f.clock),{phase:"complete",remaining:0});
      assert.equal(await f.db.pointTransaction.count({where:{userId:{in:f.actors.map(a=>a.id)},reason:"mock_rank_reward"}}),26);
    });
  });
});
