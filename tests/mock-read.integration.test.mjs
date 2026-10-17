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
