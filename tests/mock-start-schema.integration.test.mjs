import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { withMockDb } from "./helpers/mock-db.mjs";

test("accepted start identities are unique, bound to the real exam owner, and inaccessible to browser roles",{
  skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:120000,
},async()=>{
  await withMockDb({examCode:"fe",month:"2039-01"},async f=>{
    const [table]=await f.db.$queryRaw`SELECT to_regclass('public.mock_attempt_start_requests')::text AS relation`;
    assert.notEqual(table.relation,null,"persisted start request identities are required");
    const a=await f.db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId:f.actor.id,startRequestId:randomUUID(),attemptNo:1,
      startedAt:f.now(),expiresAt:new Date(+f.now()+5400000),totalQuestions:60}});
    const data={userId:f.actor.id,mockExamId:f.mockExamId,attemptId:a.id,requestId:randomUUID()};
    await f.db.mockAttemptStartRequest.create({data});
    await f.db.mockAttemptStartRequest.create({data:{...data,requestId:randomUUID()}});
    assert.equal(await f.db.mockAttemptStartRequest.count({where:{attemptId:a.id}}),2);
    await assert.rejects(f.other.mockAttemptStartRequest.create({data}),e=>e.code==="P2002");
    await assert.rejects(f.other.mockAttemptStartRequest.create({data:{...data,requestId:randomUUID(),userId:f.actors[1].id}}),e=>e.code==="P2003");
    await assert.rejects(f.other.mockAttemptStartRequest.create({data:{...data,requestId:randomUUID(),mockExamId:randomUUID()}}),e=>e.code==="P2003");
    const [security]=await f.db.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE oid='public.mock_attempt_start_requests'::regclass`;
    assert.equal(security.relrowsecurity,true);
    for(const role of ["anon","authenticated"]){
      await f.db.$transaction(async tx=>{
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        try{assert.deepEqual(await tx.$queryRawUnsafe("SELECT user_id FROM public.mock_attempt_start_requests"),[]);}
        catch(e){assert.ok(["P2010","P2004"].includes(e.code));}
      },{maxWait:10000,timeout:30000});
      await assert.rejects(f.db.$transaction(async tx=>{
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.$executeRaw`INSERT INTO public.mock_attempt_start_requests(user_id,request_id,mock_exam_id,attempt_id) VALUES (${data.userId}::uuid,${randomUUID()}::uuid,${data.mockExamId}::uuid,${data.attemptId}::uuid)`;
      },{maxWait:10000,timeout:30000}));
    }
  });
});
