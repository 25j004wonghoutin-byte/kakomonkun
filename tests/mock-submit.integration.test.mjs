import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { withMockDb } from "./helpers/mock-db.mjs";

const txOptions={maxWait:10000,timeout:30000};

async function createAttempt(f,{userId=f.actor.id,attemptNo=1,selected=0,correct=0,mockExamId=f.mockExamId,questions=f.questions}={}){
  const a=await f.db.mockAttempt.create({data:{mockExamId,userId,attemptNo,startRequestId:randomUUID(),
    startedAt:f.now(),expiresAt:new Date(+f.now()+5400000),totalQuestions:questions.length}});
  await f.db.mockAnswer.createMany({data:questions.map((q,i)=>({attemptId:a.id,mockExamId,mockQuestionId:q.id,
    selectedChoiceId:i<selected?q.choices[i<correct?0:1].id:null,
    answeredAt:i<selected?f.now():null,revision:i<selected?1:0,lastRequestId:i<selected?randomUUID():null,
  }))});
  return a;
}

test("submission atomically grades final answers, awards participation once and hides review until close",{
  skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:180000,
},async t=>{
  const url=new URL("../src/lib/mock-exams/submit.ts",import.meta.url);
  assert.ok(existsSync(url),"atomic mock grading implementation is required");
  const {submitMockAttempt:submit,gradeLockedAttempt:grade}=await import(url.href);
  const {lockMockAttempt}=await import("../src/lib/mock-exams/locks.ts");
  const {toMockAttemptView,toMockResultView}=await import("../src/lib/mock-exams/read.ts");
  const {prepareMockExam}=await import("../src/lib/mock-exams/prepare.ts");
  await withMockDb({examCode:"fe",month:"2038-06",userCount:3},async f=>{
    const a=await createAttempt(f,{selected:50,correct:50});
    await t.test("before submission, attempt DTO never contains correctness or source choice IDs",async()=>{
      const view=await f.db.$transaction(tx=>toMockAttemptView(tx,a.id,f.now()),txOptions);
      assert.equal(view.questions.length,60);assert.equal(view.answers.length,60);
      assert.equal(JSON.stringify(view).includes("isCorrect"),false);
      assert.equal(JSON.stringify(view).includes("originalChoiceId"),false);
    });
    let first;
    await t.test("two independent submit connections commit one grade and one 20-point ledger entry",async()=>{
      await f.db.questionChoice.updateMany({where:{id:{in:f.questions.map(q=>q.originalCorrectChoiceId)}},data:{isCorrect:false}});
      const input={attemptId:a.id,expectedRevision:0};
      const results=await Promise.all([submit(f.db,f.actor,input,f.clock),submit(f.other,f.actor,input,f.clock)]);
      assert.deepEqual(results[0],results[1]);first=results[0];
      assert.deepEqual([first.score,first.answeredCount,first.correctCount,first.earnedPoints,first.review],[83.33,50,50,20,null]);
      const profile=await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actor.id}});
      assert.deepEqual([profile.totalPoints,profile.totalAnswerCount,profile.totalCorrectCount,profile.totalPracticeCount],[20,50,50,0]);
      assert.equal(await f.db.pointTransaction.count({where:{userId:f.actor.id,reason:"mock_participation",sourceId:f.mockExamId}}),1);
    });
    await t.test("second submission counts real answers but pays zero and retains the better first result",async()=>{
      const b=await createAttempt(f,{attemptNo:2,selected:3,correct:2});
      const result=await submit(f.db,f.actor,{attemptId:b.id,expectedRevision:0},f.clock);
      assert.deepEqual([result.score,result.earnedPoints,result.bestAttemptId,result.bestScore],[3.33,0,a.id,83.33]);
      const profile=await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actor.id}});
      assert.deepEqual([profile.totalPoints,profile.totalAnswerCount,profile.totalCorrectCount,profile.totalPracticeCount],[20,53,52,0]);
    });
    await t.test("the other exam has a separate first-participation reward, for a total of forty points",async()=>{
      const prepared=await prepareMockExam(f.db,{examCode:"it_passport",month:"2038-06"},f.clock);f.trackExam(prepared.mockExamId);
      const questions=await f.db.mockExamQuestion.findMany({where:{mockExamId:prepared.mockExamId},include:{choices:{orderBy:{sortOrder:"asc"}}}});
      const b=await createAttempt(f,{mockExamId:prepared.mockExamId,questions});
      const r=await submit(f.db,f.actor,{attemptId:b.id,expectedRevision:0},f.clock);
      assert.deepEqual([r.answeredCount,r.score,r.earnedPoints],[0,0,20]);
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actor.id}})).totalPoints,40);
    });
    await t.test("a late manual request racing automatic grading uses expiry for submission and processing time for grading",async()=>{
      const user=f.actors[1],b=await createAttempt(f,{userId:user.id});
      const later=new Date(+b.expiresAt+86400000);f.setNow(later);
      const [manual]=await Promise.all([
        submit(f.db,user,{attemptId:b.id,expectedRevision:999},f.clock),
        f.other.$transaction(async tx=>{await lockMockAttempt(tx,user,b.id);await grade(tx,b.id,f.now());},txOptions),
      ]);
      assert.deepEqual([manual.score,manual.answeredCount,manual.earnedPoints],[0,0,20]);
      const stored=await f.db.mockAttempt.findUniqueOrThrow({where:{id:b.id}});
      assert.equal(+stored.submittedAt,+b.expiresAt);assert.equal(+stored.gradedAt,+later);
      assert.equal(await f.db.studentActivityDay.count({where:{userId:user.id}}),0);
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:user.id}})).totalAnswerCount,0);
    });
    await t.test("stale active revisions, teachers, other owners and deactivated users cannot change the attempt",async()=>{
      const user=f.actors[2],b=await createAttempt(f,{userId:user.id});
      await assert.rejects(submit(f.db,user,{attemptId:b.id,expectedRevision:1},f.clock),e=>e.code==="stale_attempt");
      await assert.rejects(submit(f.db,{...user,roleName:"teacher"},{attemptId:b.id,expectedRevision:0},f.clock),e=>e.status===403);
      await assert.rejects(submit(f.db,f.actor,{attemptId:b.id,expectedRevision:0},f.clock),e=>e.status===404);
      await f.db.user.update({where:{id:user.id},data:{status:"inactive"}});
      await assert.rejects(submit(f.db,user,{attemptId:b.id,expectedRevision:0},f.clock),e=>e.status===403);
      await f.db.user.update({where:{id:user.id},data:{status:"active"}});
      assert.equal((await f.db.mockAttempt.findUniqueOrThrow({where:{id:b.id}})).status,"in_progress");
    });
    await t.test("failure after ledger insertion rolls back correctness, points, counters and submission state",async()=>{
      const user=f.actors[2],b=await f.db.mockAttempt.findFirstOrThrow({where:{userId:user.id,mockExamId:f.mockExamId}});
      const answer=await f.db.mockAnswer.findFirstOrThrow({where:{attemptId:b.id}});
      const choice=await f.db.mockExamChoice.findFirstOrThrow({where:{mockQuestionId:answer.mockQuestionId,isCorrect:true}});
      await f.db.mockAnswer.update({where:{id:answer.id},data:{selectedChoiceId:choice.id,answeredAt:f.now(),revision:1,lastRequestId:randomUUID()}});
      const broken=f.db.$extends({query:{pointTransaction:{async createMany({args,query}){await query(args);throw new Error("Simulated failure after ledger insert");}}}});
      await assert.rejects(submit(broken,user,{attemptId:b.id,expectedRevision:0},f.clock),/Simulated failure/);
      assert.equal((await f.db.mockAttempt.findUniqueOrThrow({where:{id:b.id}})).status,"in_progress");
      assert.equal((await f.db.mockAnswer.findUniqueOrThrow({where:{id:answer.id}})).isCorrect,null);
      assert.equal(await f.db.pointTransaction.count({where:{userId:user.id}}),0);
      const p=await f.db.studentProfile.findUniqueOrThrow({where:{userId:user.id}});
      assert.deepEqual([p.totalPoints,p.totalAnswerCount,p.totalCorrectCount],[0,0,0]);
      assert.equal((await submit(f.db,user,{attemptId:b.id,expectedRevision:0},f.clock)).earnedPoints,20);
    });
    await t.test("clock is sampled after every row lock and a wait crossing expiry cannot submit early",async()=>{
      const user=f.actors[2],b=await createAttempt(f,{userId:user.id,attemptNo:2});
      let release,locked,heldTx;
      const ready=new Promise(resolve=>{locked=resolve;}),gate=new Promise(resolve=>{release=resolve;});
      const hold=f.db.$transaction(async tx=>{await tx.$executeRaw`SELECT id FROM public.mock_exams WHERE id=${f.mockExamId}::uuid FOR NO KEY UPDATE`;heldTx=tx;locked();await gate;},txOptions);
      await ready;
      let clockBeforeRelease=false,released=false;
      const waiting=submit(f.other,user,{attemptId:b.id,expectedRevision:0},async()=>{clockBeforeRelease=!released;return f.now();});
      const settled=Promise.allSettled([waiting]);
      let observedWait=false;
      try{
        for(let i=0;i<40;i++){
          await heldTx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
          const rows=await heldTx.$queryRaw`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND pg_backend_pid()=ANY(pg_blocking_pids(pid))`;
          if(rows.length){observedWait=true;break;}
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.equal(observedWait,true,"independent submit connection must actually be waiting for the exam lock");
      }finally{
        f.setNow(new Date(+b.expiresAt+1000));released=true;release();await hold;await settled;
      }
      const result=await waiting;
      assert.equal(clockBeforeRelease,false);assert.equal(result.submittedAt,b.expiresAt.toISOString());
    });
    await t.test("review opens at the month deadline only, retains frozen correctness and has a missing-explanation fallback",async()=>{
      f.setNow(new Date("2038-06-24T23:59:59.999+09:00"));
      assert.equal((await f.db.$transaction(tx=>toMockResultView(tx,a.id,f.now()),txOptions)).review,null);
      await f.db.mockExamQuestion.update({where:{id:f.questions[0].id},data:{explanation:null}});
      f.setNow(new Date("2038-06-25T00:00:00+09:00"));
      const result=await f.db.$transaction(tx=>toMockResultView(tx,a.id,f.now()),txOptions);
      assert.equal(result.review.length,60);assert.equal(result.review[0].correctChoiceId,f.questions[0].correctChoiceId);
      assert.equal(result.review[0].explanation,"解説は未登録です");
      assert.equal(result.review.filter(q=>q.isCorrect).length,50);
    });
  });
});
