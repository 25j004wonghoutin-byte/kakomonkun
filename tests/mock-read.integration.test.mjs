import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { withMockDb } from "./helpers/mock-db.mjs";

const noReview=value=>{if(!value||typeof value!=="object")return;for(const [key,item] of Object.entries(value)){assert.ok(!["isCorrect","correctChoiceId","explanation"].includes(key),key);noReview(item);}};
test("student mock read services use safe private DTOs",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:300000},async t=>{
  const {getMockList,getMockAttempt,getMockResult}=await import("../src/lib/mock-exams/read.ts");
  assert.equal(typeof getMockList,"function");
  assert.equal(typeof getMockAttempt,"function");
  assert.equal(typeof getMockResult,"function");
  const {startMockAttempt:start}=await import("../src/lib/mock-exams/start.ts");
  const {submitMockAttempt:submit}=await import("../src/lib/mock-exams/submit.ts");
  const {saveMockAnswer:save}=await import("../src/lib/mock-exams/answers.ts");
  const {getMockSchedule}=await import("../src/lib/mock-exams/schedule.ts");
  await withMockDb({examCode:"fe",month:"2040-03",userCount:3},async f=>{
    let a,b;
    await t.test("GET list never creates missing exams or attempts and uses only current student's state",async()=>{
      const list=await getMockList(f.db,f.actor,"2040-03",f.clock);noReview(list);
      assert.equal(list.exams.length,2);assert.equal(list.exams.find(e=>e.examCode==="it_passport").id,null);
      assert.equal(list.exams.find(e=>e.examCode==="fe").state,"open");
      assert.equal(await f.db.mockAttempt.count({where:{mockExamId:f.mockExamId}}),0);
      a=(await start(f.db,f.actor,{mockExamId:f.mockExamId,requestId:randomUUID()},f.clock)).attempt;
      b=(await start(f.db,f.actors[1],{mockExamId:f.mockExamId,requestId:randomUUID()},f.clock)).attempt;
      const q=f.questions[0];
      noReview(await save(f.db,f.actor,{attemptId:a.id,mockQuestionId:q.id,selectedChoiceId:q.correctChoiceId,expectedRevision:0,requestId:randomUUID()},f.clock));
      const own=await getMockAttempt(f.db,f.actor,a.id,f.clock),other=await getMockAttempt(f.db,f.actors[1],b.id,f.clock);
      noReview(own);noReview(other);assert.equal(own.attempt.answers[0].selectedChoiceId,q.correctChoiceId);assert.equal(other.attempt.answers[0].selectedChoiceId,null);
      const another=await getMockList(f.db,f.actors[2],"2040-03",f.clock);noReview(another);assert.equal(another.exams.find(e=>e.examCode==="fe").activeAttemptId,null);
    });
    await t.test("missing IDs, other owners, teachers and stale inactive actors are denied",async()=>{
      await assert.rejects(getMockAttempt(f.db,f.actor,randomUUID(),f.clock),e=>e.status===404);
      await assert.rejects(getMockAttempt(f.db,f.actor,b.id,f.clock),e=>e.status===403);
      await assert.rejects(getMockResult(f.db,f.actor,b.id,f.clock),e=>e.status===403);
      await assert.rejects(getMockList(f.db,{...f.actor,roleName:"teacher"},"2040-03",f.clock),e=>e.status===403);
      await assert.rejects(getMockResult(f.db,f.actor,a.id,f.clock),e=>e.status===409);
      await f.db.user.update({where:{id:f.actors[2].id},data:{status:"inactive"}});
      await assert.rejects(getMockList(f.db,f.actors[2],"2040-03",f.clock),e=>e.status===403);
      await f.db.user.update({where:{id:f.actors[2].id},data:{status:"active"}});
    });
    await t.test("list GET grades only expired own attempts, and read resume returns the same result",async()=>{
      f.setNow(new Date(a.expiresAt));
      const list=await getMockList(f.db,f.actor,"2040-03",f.clock);noReview(list);
      const card=list.exams.find(e=>e.examCode==="fe");assert.equal(card.results.length,1);assert.equal(card.activeAttemptId,null);assert.equal(card.remainingAttempts,1);
      const result=await getMockAttempt(f.db,f.actor,a.id,f.clock);assert.equal(result.kind,"result");noReview(result);assert.equal(result.result.correctCount,1);
      assert.equal((await f.db.mockAttempt.findUnique({where:{id:b.id}})).status,"in_progress");
      noReview(await submit(f.db,f.actors[1],{attemptId:b.id,expectedRevision:0},f.clock));
    });
    await t.test("no review fields appear before close, and exactly at close frozen review is available",async()=>{
      const close=getMockSchedule("2040-03").closesAt;
      f.setNow(new Date(+close-1));const hidden=await getMockResult(f.db,f.actor,a.id,f.clock);noReview(hidden);assert.equal(hidden.review,null);
      f.setNow(close);const result=await getMockResult(f.db,f.actor,a.id,f.clock);
      assert.equal(result.review.length,60);assert.equal(result.review[0].correctChoiceId,f.questions[0].correctChoiceId);assert.equal(result.review[0].isCorrect,true);assert.equal(typeof result.review[0].explanation,"string");
      const list=await getMockList(f.db,f.actor,"2040-03",f.clock);assert.equal(list.exams.find(e=>e.examCode==="fe").state,"closed");assert.equal(list.exams.find(e=>e.examCode==="fe").results[0].review.length,60);
    });
  });
});

test("rank reads isolate exam/month, bound expiry grading and preserve stored final positions",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:300000},async t=>{
  const p=new URL("../src/lib/mock-exams/ranking.ts",import.meta.url);
  const {existsSync}=await import("node:fs");assert.ok(existsSync(p),"ranking read service must exist");
  const {getMockRanking}=await import(p.href);
  await withMockDb({examCode:"fe",month:"2040-04",userCount:27},async f=>{
    const submitted=[];
    for(const [i,count] of [50,50,40,40,20].entries()){
      submitted.push(await f.db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId:f.actors[i].id,startRequestId:randomUUID(),attemptNo:1,status:"submitted",startedAt:new Date(+f.now()-60000),expiresAt:new Date(+f.now()+5400000),submittedAt:f.now(),gradedAt:f.now(),totalQuestions:60,answeredCount:count,correctCount:count,score:count/60*100}}));
    }
    await f.db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId:f.actors[0].id,startRequestId:randomUUID(),attemptNo:2,status:"submitted",startedAt:new Date(+f.now()-60000),expiresAt:new Date(+f.now()+5400000),submittedAt:f.now(),gradedAt:f.now(),totalQuestions:60,answeredCount:50,correctCount:50,score:83.33}});
    await t.test("live ties include four top students and my lower place, without final records or title rewards",async()=>{
      const next=await f.db.mockExam.create({data:{examId:f.examId,title:`Next QA ${f.runId}`,targetMonth:new Date("2040-05-01"),timeLimitMinutes:90,questionCount:60,status:"ready",availableFrom:new Date("2040-05-01T00:00:00+09:00"),availableUntil:new Date("2040-05-25T00:00:00+09:00"),createdBy:f.actor.id}});f.trackExam(next.id);
      const view=await getMockRanking(f.db,f.actors[4],"fe","2040-04",f.clock);
      assert.deepEqual(view.top.map(r=>r.rankNo),[1,1,3,3]);assert.equal(view.mine.rankNo,5);assert.equal(view.state,"provisional");
      assert.equal(view.availableMonths.includes("2040-05"),false,"next month's prepared exam is not a published history option");
      assert.equal(await f.db.monthlyRanking.count({where:{mockExamId:f.mockExamId}}),0);
      assert.equal(await f.db.userTitleUnlock.count({where:{userId:{in:f.actors.map(a=>a.id)}}}),0);
      assert.equal((await getMockRanking(f.db,f.actor,"it_passport","2040-04",f.clock)).top.length,0);
      assert.equal((await getMockRanking(f.db,f.actor,"fe","2040-05",f.clock)).top.length,0);
    });
    await t.test("stopped students keep their rank but have no link or unsafe avatar URL",async()=>{
      await f.db.user.update({where:{id:f.actors[1].id},data:{status:"inactive"}});
      await f.db.studentProfile.update({where:{userId:f.actors[2].id},data:{avatarUrl:"https://untrusted.example/avatar.png"}});
      const view=await getMockRanking(f.db,f.actor,"fe","2040-04",f.clock);
      assert.equal(view.top.find(r=>r.userId===f.actors[1].id).profileHref,null);
      assert.equal(view.top.find(r=>r.userId===f.actors[2].id).avatarUrl,null);assert.deepEqual(view.top.map(r=>r.rankNo),[1,1,3,3]);
    });
    await t.test("only twenty-five due attempts are graded in one read, with settling until leftovers clear",async()=>{
      const startedAt=new Date(+f.now()-7200000),expiresAt=new Date(+f.now()-1800000);
      await f.db.mockAttempt.createMany({data:f.actors.slice(1).map((a,i)=>({mockExamId:f.mockExamId,userId:a.id,startRequestId:randomUUID(),attemptNo:i<4?2:1,startedAt,expiresAt,totalQuestions:60}))});
      const view=await getMockRanking(f.db,f.actor,"fe","2040-04",f.clock);
      assert.equal(view.state,"settling");assert.equal(await f.db.mockAttempt.count({where:{mockExamId:f.mockExamId,status:"in_progress"}}),1);
      assert.equal((await getMockRanking(f.db,f.actor,"fe","2040-04",f.clock)).state,"provisional");
    });
    await t.test("after finalization saved positions and scores are used without re-ranking inactive students",async()=>{
      f.setNow(new Date("2040-04-25T00:00:00+09:00"));
      await f.db.monthlyRanking.create({data:{mockExamId:f.mockExamId,targetMonth:new Date("2040-04-01"),userId:f.actor.id,bestAttemptId:submitted[0].id,rankNo:7,mockScore:83.33,correctCount:50,totalQuestions:60,isFinal:true}});
      await f.db.mockExam.update({where:{id:f.mockExamId},data:{rankingFinalizedAt:f.now()}});
      const view=await getMockRanking(f.db,f.actor,"fe","2040-04",f.clock);
      assert.equal(view.state,"final");assert.equal(view.mine.rankNo,7);assert.equal(view.top.length,0);assert.equal(view.rewardsComplete,false);
    });
  });
});
