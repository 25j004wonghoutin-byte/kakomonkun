import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { withMockDb } from "./helpers/mock-db.mjs";

test("autosave prevents stale overwrites and counts only actual saved selection activity",{
  skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:300000,
},async t=>{
  const url=new URL("../src/lib/mock-exams/answers.ts",import.meta.url);
  assert.ok(existsSync(url),"optimistic mock answer save implementation is required");
  const {saveMockAnswer:save}=await import(url.href);
  const {startMockAttempt:start}=await import("../src/lib/mock-exams/start.ts");
  const {submitMockAttempt:submit}=await import("../src/lib/mock-exams/submit.ts");
  await withMockDb({examCode:"fe",month:"2040-02",userCount:4},async f=>{
    f.setNow(new Date("2040-02-02T23:30:00+09:00"));
    const a=(await start(f.db,f.actor,{mockExamId:f.mockExamId,requestId:randomUUID()},f.clock)).attempt;
    const q=f.questions[0],q1=f.questions[1];
    const original={attemptId:a.id,mockQuestionId:q.id,selectedChoiceId:q.correctChoiceId,expectedRevision:0,requestId:randomUUID()};
    let firstActivity;
    await t.test("a selected choice advances question and attempt revisions but not cumulative submitted counters",async()=>{
      const saved=await save(f.db,f.actor,original,f.clock);
      assert.equal(saved.kind,"saved");assert.deepEqual([saved.answer.revision,saved.attemptRevision],[1,1]);
      const profile=await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actor.id}});
      assert.deepEqual([profile.totalPoints,profile.totalAnswerCount,profile.totalCorrectCount],[0,0,0]);
      firstActivity=await f.db.studentActivityDay.findFirstOrThrow({where:{userId:f.actor.id}});
      assert.equal(firstActivity.hasAnswered,true);assert.equal(firstActivity.activityDate.toISOString().slice(0,10),"2040-02-02");
      assert.equal((await f.db.mockAnswer.findUniqueOrThrow({where:{attemptId_mockQuestionId:{attemptId:a.id,mockQuestionId:q.id}}})).isCorrect,null);
      assert.equal(JSON.stringify(saved).includes("isCorrect"),false);
    });
    await t.test("an exact replay cannot advance revisions, notifications or activity last-seen time",async()=>{
      const notifications=await f.db.notification.count({where:{recipientId:f.actor.id}});
      f.setNow(new Date("2040-02-02T23:31:00+09:00"));
      const replay=await save(f.other,f.actor,original,f.clock);
      assert.deepEqual([replay.answer.revision,replay.attemptRevision],[1,1]);
      const day=await f.db.studentActivityDay.findUniqueOrThrow({where:{userId_activityDate:{userId:f.actor.id,activityDate:firstActivity.activityDate}}});
      assert.equal(+day.lastSeenAt,+firstActivity.lastSeenAt);
      assert.equal(await f.db.notification.count({where:{recipientId:f.actor.id}}),notifications);
      for(const extra of [{selectedChoiceId:q.choices[1].id},{expectedRevision:1}]){
        await assert.rejects(save(f.db,f.actor,{...original,...extra},f.clock),e=>e.status===409);
      }
    });
    await t.test("a later change rejects an old replay rather than restoring the old choice",async()=>{
      const next=await save(f.db,f.actor,{...original,selectedChoiceId:q.choices[1].id,expectedRevision:1,requestId:randomUUID()},f.clock);
      assert.deepEqual([next.answer.revision,next.attemptRevision],[2,2]);
      await assert.rejects(save(f.other,f.actor,original,f.clock),e=>e.status===409);
      assert.equal((await f.db.mockAnswer.findUniqueOrThrow({where:{attemptId_mockQuestionId:{attemptId:a.id,mockQuestionId:q.id}}})).selectedChoiceId,q.choices[1].id);
    });
    await t.test("clearing a selection is persisted without inventing an answered day; the next real choice records it",async()=>{
      f.setNow(new Date("2040-02-03T00:10:00+09:00"));
      const cleared=await save(f.db,f.actor,{...original,selectedChoiceId:null,expectedRevision:2,requestId:randomUUID()},f.clock);
      assert.deepEqual([cleared.answer.selectedChoiceId,cleared.answer.revision,cleared.attemptRevision],[null,3,3]);
      const row=await f.db.mockAnswer.findUniqueOrThrow({where:{attemptId_mockQuestionId:{attemptId:a.id,mockQuestionId:q.id}}});
      assert.equal(row.answeredAt,null);assert.equal(await f.db.studentActivityDay.count({where:{userId:f.actor.id}}),1);
      const next=await save(f.db,f.actor,{...original,mockQuestionId:q1.id,selectedChoiceId:q1.correctChoiceId,requestId:randomUUID()},f.clock);
      assert.deepEqual([next.answer.revision,next.attemptRevision],[1,4]);
      const days=await f.db.studentActivityDay.findMany({where:{userId:f.actor.id},orderBy:{activityDate:"asc"}});
      assert.deepEqual(days.map(day=>[day.activityDate.toISOString().slice(0,10),day.hasAnswered]),[["2040-02-02",true],["2040-02-03",true]]);
    });
    await t.test("same-value saves are no-ops and do not refresh usage",async()=>{
      const day=await f.db.studentActivityDay.findFirstOrThrow({where:{userId:f.actor.id},orderBy:{activityDate:"desc"}});
      f.setNow(new Date("2040-02-03T00:11:00+09:00"));
      const noop=await save(f.db,f.actor,{...original,mockQuestionId:q1.id,selectedChoiceId:q1.correctChoiceId,expectedRevision:1,requestId:randomUUID()},f.clock);
      assert.deepEqual([noop.answer.revision,noop.attemptRevision],[1,4]);
      assert.equal(+(await f.db.studentActivityDay.findUniqueOrThrow({where:{userId_activityDate:{userId:f.actor.id,activityDate:day.activityDate}}})).lastSeenAt,+day.lastSeenAt);
    });
    await t.test("foreign questions, foreign choices, invalid IDs and other owners cannot modify answers",async()=>{
      for(const extra of [{selectedChoiceId:q1.correctChoiceId,expectedRevision:3},{mockQuestionId:randomUUID()},{selectedChoiceId:randomUUID()},{requestId:"bad"}]){
        await assert.rejects(save(f.db,f.actor,{...original,...extra,requestId:extra.requestId??randomUUID()},f.clock),e=>e.status===400);
      }
      await assert.rejects(save(f.db,f.actors[1],original,f.clock),e=>e.status===404);
    });
    await t.test("two independent tabs changing one question from the same revision have exactly one winner",async()=>{
      const question=f.questions[2],left={...original,mockQuestionId:question.id,selectedChoiceId:question.correctChoiceId,requestId:randomUUID()},right={...original,mockQuestionId:question.id,selectedChoiceId:question.choices[1].id,requestId:randomUUID()};
      const outcomes=await Promise.allSettled([save(f.db,f.actor,left,f.clock),save(f.other,f.actor,right,f.clock)]);
      assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
      assert.equal(outcomes.find(r=>r.status==="rejected").reason.status,409);
      const row=await f.db.mockAnswer.findUniqueOrThrow({where:{attemptId_mockQuestionId:{attemptId:a.id,mockQuestionId:question.id}}});
      assert.equal(row.revision,1);assert.equal((await f.db.mockAttempt.findUniqueOrThrow({where:{id:a.id}})).revision,5);
      assert.equal(row.selectedChoiceId,outcomes[0].status==="fulfilled"?left.selectedChoiceId:right.selectedChoiceId);
      await assert.rejects(submit(f.db,f.actor,{attemptId:a.id,expectedRevision:0},f.clock),e=>e.code==="stale_attempt");
    });
    await t.test("save versus submit either saves then demands reconfirmation, or returns the already-submitted result",async()=>{
      const actor=f.actors[1],b=(await start(f.db,actor,{mockExamId:f.mockExamId,requestId:randomUUID()},f.clock)).attempt;
      const [saving,submitting]=await Promise.allSettled([
        save(f.db,actor,{...original,attemptId:b.id,requestId:randomUUID()},f.clock),
        submit(f.other,actor,{attemptId:b.id,expectedRevision:0},f.clock),
      ]);
      assert.equal(saving.status,"fulfilled");
      let result;
      if(submitting.status==="rejected"){
        assert.equal(submitting.reason.code,"stale_attempt");assert.equal(saving.value.kind,"saved");
        result=await submit(f.db,actor,{attemptId:b.id,expectedRevision:saving.value.attemptRevision},f.clock);
      }else{result=submitting.value;assert.equal(saving.value.kind,"submitted");}
      assert.equal(result.answeredCount,result.correctCount);
      assert.ok([0,1].includes(result.answeredCount));assert.equal(result.earnedPoints,20);
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:actor.id}})).totalAnswerCount,result.answeredCount);
      assert.equal(await f.db.pointTransaction.count({where:{userId:actor.id,reason:"mock_participation"}}),1);
    });
    await t.test("a real row-lock wait crossing expiry cannot adopt the pending choice or refresh activity",async()=>{
      const before=await f.db.studentActivityDay.findFirstOrThrow({where:{userId:f.actor.id},orderBy:{activityDate:"desc"}});
      f.setNow(new Date(Date.parse(a.expiresAt)-1));
      let ready,release,heldTx;
      const locked=new Promise(resolve=>{ready=resolve;}),gate=new Promise(resolve=>{release=resolve;});
      const hold=f.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM public.mock_exams WHERE id=${f.mockExamId}::uuid FOR NO KEY UPDATE`;heldTx=tx;ready();await gate;},{maxWait:10000,timeout:30000});
      await locked;
      const question=f.questions[3],pending=save(f.other,f.actor,{...original,mockQuestionId:question.id,selectedChoiceId:question.correctChoiceId,requestId:randomUUID()},f.clock),settled=Promise.allSettled([pending]);
      let observed=false;
      try{
        for(let i=0;i<40;i++){
          await heldTx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
          const rows=await heldTx.$queryRaw`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND pg_backend_pid()=ANY(pg_blocking_pids(pid))`;
          if(rows.length){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.equal(observed,true,"save must actually wait on the independent connection");
      }finally{f.setNow(new Date(a.expiresAt));release();await hold;await settled;}
      const late=await pending;assert.equal(late.kind,"submitted");assert.equal(late.result.answeredCount,2);
      const row=await f.db.mockAnswer.findUniqueOrThrow({where:{attemptId_mockQuestionId:{attemptId:a.id,mockQuestionId:question.id}}});
      assert.deepEqual([row.selectedChoiceId,row.revision],[null,0]);
      assert.equal(+(await f.db.studentActivityDay.findUniqueOrThrow({where:{userId_activityDate:{userId:f.actor.id,activityDate:before.activityDate}}})).lastSeenAt,+before.lastSeenAt);
    });
    await t.test("initial blank no-op does not manufacture revision, request history or activity",async()=>{
      const actor=f.actors[2],b=(await start(f.db,actor,{mockExamId:f.mockExamId,requestId:randomUUID()},f.clock)).attempt;
      const blank=await save(f.db,actor,{...original,attemptId:b.id,selectedChoiceId:null,requestId:randomUUID()},f.clock);
      assert.deepEqual([blank.answer.revision,blank.attemptRevision],[0,0]);
      assert.equal(await f.db.studentActivityDay.count({where:{userId:actor.id}}),0);
      assert.equal((await f.db.mockAnswer.findUniqueOrThrow({where:{attemptId_mockQuestionId:{attemptId:b.id,mockQuestionId:q.id}}})).lastRequestId,null);
    });
    await t.test("an activity-write failure rolls back selection, both revisions, tracking and notifications",async()=>{
      const actor=f.actors[3],b=(await start(f.db,actor,{mockExamId:f.mockExamId,requestId:randomUUID()},f.clock)).attempt;
      const broken=f.db.$extends({query:{studentActivityDay:{async upsert({args,query}){await query(args);throw new Error("Simulated activity failure");}}}});
      const request={...original,attemptId:b.id,requestId:randomUUID()};
      await assert.rejects(save(broken,actor,request,f.clock),/Simulated activity failure/);
      const row=await f.db.mockAnswer.findUniqueOrThrow({where:{attemptId_mockQuestionId:{attemptId:b.id,mockQuestionId:q.id}}});
      assert.deepEqual([row.selectedChoiceId,row.revision,row.lastRequestId],[null,0,null]);
      assert.equal((await f.db.mockAttempt.findUniqueOrThrow({where:{id:b.id}})).revision,0);
      assert.equal((await f.db.studentProfile.findUniqueOrThrow({where:{userId:actor.id}})).titleTrackingStartedAt,null);
      assert.equal(await f.db.studentActivityDay.count({where:{userId:actor.id}}),0);
      assert.equal(await f.db.notification.count({where:{recipientId:actor.id}}),0);
      assert.equal((await save(f.db,actor,request,f.clock)).answer.revision,1);
    });
  });
});
