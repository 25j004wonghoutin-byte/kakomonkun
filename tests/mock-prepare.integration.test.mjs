import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { withMockDb } from "./helpers/mock-db.mjs";

// 実SQLの候補を自作UUID行だけへ絞る。DB制約・transaction・別接続は実物を使う。
const ownPool=(client,runId)=>client.$extends({query:{question:{findMany({args,query}){
  return query({...args,where:{AND:[args.where??{},{sourceKey:{startsWith:`mock-qa:${runId}:`}}]}});
}}}});

test("preparation freezes one complete shared set per exam/month with atomic rollback",{
  skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:180000,
},async t=>{
  const url=new URL("../src/lib/mock-exams/prepare.ts",import.meta.url);
  assert.ok(existsSync(url),"monthly question preparation is required");
  const {prepareMockExam}=await import(url.href);
  for(const [examCode,month,count] of [["fe","2037-02",60],["it_passport","2037-03",100]]){
    await withMockDb({examCode,month,prepared:false},async f=>{
      const input={examCode,month},db=ownPool(f.db,f.runId),other=ownPool(f.other,f.runId);
      await t.test(`${examCode}: an error after the first insert rolls back the whole set`,async()=>{
        await assert.rejects(prepareMockExam(db,input,async tx=>{
          const row=await tx.mockExam.findUnique({where:{examId_targetMonth:{examId:f.examId,targetMonth:new Date(`${month}-01`)}}});
          assert.ok(row);f.trackExam(row.id);throw new Error("Simulated clock failure after first write");
        }),/Simulated clock failure/);
        assert.equal(await f.db.mockExam.count({where:{examId:f.examId,targetMonth:new Date(`${month}-01`)}}),0);
      });
      await t.test(`${examCode}: invalid candidates fail without publishing a reduced set`,async()=>{
        const id=f.questions[0].sourceQuestionId;
        await f.db.question.update({where:{id},data:{status:"draft"}});
        await assert.rejects(prepareMockExam(db,input,f.clock),e=>e.code==="insufficient_questions");
        assert.equal(await f.db.mockExam.count({where:{examId:f.examId,targetMonth:new Date(`${month}-01`)}}),0);
        await f.db.question.update({where:{id},data:{status:"published"}});
        const otherExam=await f.db.exam.findUniqueOrThrow({where:{code:examCode==="fe"?"it_passport":"fe"}});
        await f.db.question.update({where:{id},data:{examId:otherExam.id}});
        await assert.rejects(prepareMockExam(db,input,f.clock),e=>e.code==="insufficient_questions");
        await f.db.question.update({where:{id},data:{examId:f.examId}});
      });
      await t.test(`${examCode}: concurrent preparation shares the same ID, count and ordered snapshots`,async()=>{
        const [a,b]=await Promise.all([prepareMockExam(db,input,f.clock),prepareMockExam(other,input,f.clock)]);
        f.trackExam(a.mockExamId);f.trackExam(b.mockExamId);
        assert.equal(a.mockExamId,b.mockExamId);assert.equal(Number(a.created)+Number(b.created),1);
        const frozen=await f.db.mockExamQuestion.findMany({where:{mockExamId:a.mockExamId},orderBy:{orderNo:"asc"},include:{choices:{orderBy:{sortOrder:"asc"}}}});
        assert.equal(frozen.length,count);assert.deepEqual(frozen.map(q=>q.orderNo),Array.from({length:count},(_,i)=>i+1));
        assert.equal(new Set(frozen.map(q=>q.questionId)).size,count);
        for(const q of frozen){assert.equal(q.choices.length,4);assert.equal(q.choices.filter(c=>c.isCorrect).length,1);assert.equal(q.categoryCode,"technology");}
        const first=frozen[0];
        await f.db.question.update({where:{id:first.questionId},data:{questionText:"元データを変更した検証",explanation:"変更後"}});
        await f.db.questionChoice.delete({where:{id:first.choices[0].originalChoiceId}});
        const again=await prepareMockExam(other,input,f.clock);
        assert.deepEqual(again,{mockExamId:a.mockExamId,created:false});
        const unchanged=await f.db.mockExamQuestion.findMany({where:{mockExamId:a.mockExamId},orderBy:{orderNo:"asc"},include:{choices:{orderBy:{sortOrder:"asc"}}}});
        assert.deepEqual(unchanged,frozen);
      });
    });
  }
});

test("preparation rechecks the publication deadline after locking and preserves an existing frozen exam",{
  skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:180000,
},async()=>{
  const {prepareMockExam}=await import("../src/lib/mock-exams/prepare.ts");
  await withMockDb({examCode:"fe",month:"2048-04",userCount:1,prepared:false},async f=>{
    const db=ownPool(f.db,f.runId),input={examCode:"fe",month:"2048-04"},where={examId:f.examId,targetMonth:new Date("2048-04-01")};
    try{
      f.setNow(new Date("2048-04-25T00:00:00+09:00"));
      await assert.rejects(prepareMockExam(db,input,f.clock),error=>error.code==="preparation_expired");
      assert.equal(await f.db.mockExam.count({where}),0);
      f.setNow(new Date("2048-04-24T23:59:59+09:00"));
      const ready=await prepareMockExam(db,input,f.clock);f.trackExam(ready.mockExamId);
      const before=await f.db.mockExam.findUniqueOrThrow({where:{id:ready.mockExamId}});
      f.setNow(new Date("2048-05-02T00:00:00+09:00"));
      assert.deepEqual(await prepareMockExam(db,input,f.clock),{mockExamId:ready.mockExamId,created:false});
      assert.deepEqual(await f.db.mockExam.findUniqueOrThrow({where:{id:ready.mockExamId}}),before);
    }finally{for(const row of await f.db.mockExam.findMany({where}))f.trackExam(row.id);}
  });
});
