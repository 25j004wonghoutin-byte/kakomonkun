import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("monthly mock schema enforces actual PostgreSQL constraints and isolation", {
  skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:180_000,
}, async t => {
  const url=new URL("./helpers/mock-db.mjs",import.meta.url);
  assert.ok(existsSync(url),"isolated mock database fixture is required");
  const {withMockDb}=await import(url.href);
  await withMockDb({examCode:"fe",month:"2036-10",userCount:3},async f=>{
    const attempt = (userId=f.actor.id,attemptNo=1,extra={}) => ({
      id:randomUUID(),mockExamId:f.mockExamId,userId,startRequestId:randomUUID(),attemptNo,
      startedAt:f.now(),expiresAt:new Date(+f.now()+5400000),totalQuestions:60,...extra,
    });
    const a=await f.db.mockAttempt.create({data:attempt()});
    const q=f.questions[0];
    await t.test("only attempts one and two and one in-progress attempt per exam/student",async()=>{
      await assert.rejects(f.other.mockAttempt.create({data:attempt(f.actor.id,3)}));
      await assert.rejects(f.other.mockAttempt.create({data:attempt(f.actor.id,2)}),e=>e.code==="P2002");
      await f.db.mockAttempt.update({where:{id:a.id},data:{status:"submitted",submittedAt:f.now(),gradedAt:f.now()}});
      const second=await f.db.mockAttempt.create({data:attempt(f.actor.id,2)});
      assert.equal(second.attemptNo,2);
      await assert.rejects(f.other.mockAttempt.create({data:attempt(f.actor.id,1)}),e=>e.code==="P2002");
    });
    await t.test("answers may be blank, but a choice from another frozen question is rejected",async()=>{
      const blank=await f.db.mockAnswer.create({data:{attemptId:a.id,mockExamId:f.mockExamId,mockQuestionId:q.id}});
      assert.equal(blank.selectedChoiceId,null);assert.equal(blank.isCorrect,null);
      await assert.rejects(f.other.mockAnswer.update({where:{id:blank.id},data:{selectedChoiceId:f.questions[1].correctChoiceId,answeredAt:f.now()}}),e=>e.code==="P2003");
      const selected=await f.db.mockAnswer.update({where:{id:blank.id},data:{selectedChoiceId:q.correctChoiceId,answeredAt:f.now(),revision:1,lastRequestId:randomUUID()}});
      assert.equal(selected.selectedChoiceId,q.correctChoiceId);
    });
    await t.test("snapshots survive source edits and the original choice can be deleted",async()=>{
      await f.db.question.update({where:{id:q.sourceQuestionId},data:{questionText:"元の問題を更新"}});
      await f.db.questionChoice.delete({where:{id:q.originalCorrectChoiceId}});
      const frozen=await f.db.mockExamQuestion.findUnique({where:{id:q.id},include:{choices:true}});
      assert.equal(frozen.questionText,q.questionText);
      assert.equal(frozen.choices.find(c=>c.id===q.correctChoiceId).isCorrect,true);
    });
    await t.test("ties and decimal scores are persisted without rank uniqueness",async()=>{
      const b=await f.db.mockAttempt.create({data:attempt(f.actors[1].id,1,{status:"submitted",submittedAt:f.now(),gradedAt:f.now(),correctCount:50,answeredCount:60,score:83.33})});
      for(const [actor,best] of [[f.actor,a],[f.actors[1],b]]) {
        await f.db.monthlyRanking.create({data:{mockExamId:f.mockExamId,targetMonth:new Date("2036-10-01"),userId:actor.id,bestAttemptId:best.id,rankNo:1,mockScore:83.33,correctCount:50,totalQuestions:60,isFinal:true}});
      }
      const rows=await f.db.monthlyRanking.findMany({where:{mockExamId:f.mockExamId}});
      assert.deepEqual(rows.map(r=>r.rankNo),[1,1]);assert.equal(Number(rows[0].mockScore),83.33);
      await assert.rejects(f.other.monthlyRanking.create({data:{mockExamId:f.mockExamId,targetMonth:new Date("2036-10-01"),userId:f.actors[2].id,bestAttemptId:a.id,rankNo:2,mockScore:0,correctCount:0,totalQuestions:60,isFinal:true}}),e=>e.code==="P2003");
      await assert.rejects(f.other.user.delete({where:{id:f.actor.id}}),e=>e.code==="P2003");
    });
    await t.test("one reminder per recipient/month while existing title notifications remain valid",async()=>{
      const data={recipientId:f.actor.id,type:"mock_exam_reminder",targetMonth:new Date("2036-10-01")};
      await f.db.notification.create({data});
      await assert.rejects(f.other.notification.create({data}),e=>e.code==="P2002");
      const title=await f.db.title.findFirstOrThrow();
      await f.db.notification.create({data:{recipientId:f.actor.id,type:"title_unlocked",titleId:title.id}});
      assert.equal(await f.db.notification.count({where:{recipientId:f.actor.id}}),2);
    });
    await t.test("migration rerun against live exam data fails before any schema operation",async()=>{
      const sql=new TextDecoder("utf-8",{fatal:true}).decode(readFileSync(new URL("../supabase/migrations/20261016000000_monthly_mock_exams.sql",import.meta.url)));
      await assert.rejects(f.db.$transaction(tx=>tx.$executeRawUnsafe(sql)),e=>String(e.meta?.message??e.message).includes("MOCK_TABLES_NOT_EMPTY"));
      assert.equal(await f.db.mockExam.count({where:{id:f.mockExamId}}),1);
      assert.equal(await f.db.mockAttempt.count({where:{mockExamId:f.mockExamId}}),3);
    });
    await t.test("new tables are RLS protected and anonymous requests cannot write",async()=>{
      const rows=await f.db.$queryRaw`SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relname IN ('mock_exam_choices','mock_exam_job_runs') ORDER BY relname`;
      assert.deepEqual(rows.map(r=>[r.relname,r.relrowsecurity]),[["mock_exam_choices",true],["mock_exam_job_runs",true]]);
      for(const role of ["anon","authenticated"]){
        await f.db.$transaction(async tx=>{
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          let read;
          try {read=await tx.$queryRawUnsafe("SELECT id FROM public.mock_exam_choices LIMIT 1");}
          catch(e){assert.ok(["P2010","P2004"].includes(e.code));return;}
          assert.deepEqual(read,[]);
        });
        await assert.rejects(f.db.$transaction(async tx=>{
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$executeRawUnsafe("INSERT INTO public.mock_exam_job_runs(job_key,kind,target_month) VALUES ('forbidden','dispatch','2036-10-01')");
        }));
      }
    });
  });
});
