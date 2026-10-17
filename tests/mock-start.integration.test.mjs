import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { withMockDb } from "./helpers/mock-db.mjs";

test("start and resume preserve every accepted request identity and consume at most two attempts",{
  skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:180000,
},async t=>{
  const url=new URL("../src/lib/mock-exams/start.ts",import.meta.url);
  assert.ok(existsSync(url),"bounded mock attempt start implementation is required");
  const {startMockAttempt:start}=await import(url.href);
  const {submitMockAttempt:submit}=await import("../src/lib/mock-exams/submit.ts");
  const {prepareMockExam}=await import("../src/lib/mock-exams/prepare.ts");
  await withMockDb({examCode:"fe",month:"2039-02",userCount:5},async f=>{
    const input=requestId=>({mockExamId:f.mockExamId,requestId:requestId??randomUUID()});
    const count=actor=>f.db.mockAttempt.count({where:{mockExamId:f.mockExamId,userId:actor.id}});
    const initial=f.now(),closes=new Date("2039-02-25T00:00:00+09:00");
    await t.test("unopened, unprepared, unknown and invalid starts create neither attempts nor request mappings",async()=>{
      f.setNow(new Date("2039-01-31T23:59:59.999+09:00"));
      await assert.rejects(start(f.db,f.actor,input(),f.clock),e=>e.code==="exam_closed");
      f.setNow(initial);
      await f.db.mockExam.update({where:{id:f.mockExamId},data:{status:"draft"}});
      await assert.rejects(start(f.db,f.actor,input(),f.clock),e=>e.status===503);
      await f.db.mockExam.update({where:{id:f.mockExamId},data:{status:"ready"}});
      await assert.rejects(start(f.db,f.actor,{mockExamId:randomUUID(),requestId:randomUUID()},f.clock),e=>e.status===404);
      await assert.rejects(start(f.db,f.actor,input("not-a-uuid"),f.clock),e=>e.status===400);
      assert.equal(await count(f.actor),0);
      assert.equal(await f.db.mockAttemptStartRequest.count({where:{userId:f.actor.id}}),0);
    });
    const aInput=input(),bInput=input();let firstId;
    await t.test("two independent concurrent start IDs return one fixed attempt, saving both identities",async()=>{
      const [a,b]=await Promise.all([start(f.db,f.actor,aInput,f.clock),start(f.other,f.actor,bInput,f.clock)]);
      assert.equal(a.kind,"attempt");assert.equal(b.kind,"attempt");firstId=a.attempt.id;
      assert.deepEqual(a,b);assert.equal(a.attempt.attemptNo,1);
      assert.equal(a.attempt.questions.length,60);assert.equal(a.attempt.answers.length,60);
      assert.deepEqual(a.attempt.questions.map(q=>q.id),f.questions.map(q=>q.id));
      assert.equal(Date.parse(a.attempt.expiresAt)-Date.parse(a.attempt.startedAt),5400000);
      assert.equal(await count(f.actor),1);
      const aliases=await f.db.mockAttemptStartRequest.findMany({where:{userId:f.actor.id}});
      assert.equal(aliases.length,2);assert.ok(aliases.every(row=>row.attemptId===firstId));
    });
    await t.test("after submit, replay of the original ID and resumed ID returns result one, never attempt two",async()=>{
      await submit(f.db,f.actor,{attemptId:firstId,expectedRevision:0},f.clock);
      for(const request of [aInput,bInput]){
        const replay=await start(f.other,f.actor,request,f.clock);
        assert.equal(replay.kind,"result");assert.equal(replay.result.attemptId,firstId);
      }
      assert.equal(await count(f.actor),1);
    });
    await t.test("a new-start stop allows known request recovery but cannot allocate attempt two",async()=>{
      const before=process.env.KAKOMON_MOCK_STARTS_ENABLED;
      try{
        process.env.KAKOMON_MOCK_STARTS_ENABLED="false";
        assert.equal((await start(f.db,f.actor,bInput,f.clock)).kind,"result");
        await assert.rejects(start(f.db,f.actor,input(),f.clock),e=>e.status===503);
      }finally{process.env.KAKOMON_MOCK_STARTS_ENABLED=before;}
      assert.equal(await count(f.actor),1);
    });
    await t.test("only a fresh explicit request allocates number two and a third cannot be created",async()=>{
      const second=await start(f.db,f.actor,input(),f.clock);
      assert.equal(second.kind,"attempt");assert.equal(second.attempt.attemptNo,2);
      assert.notEqual(second.attempt.id,firstId);
      const old=await start(f.other,f.actor,bInput,f.clock);
      assert.equal(old.kind,"result");assert.equal(old.result.attemptId,firstId);
      await submit(f.db,f.actor,{attemptId:second.attempt.id,expectedRevision:0},f.clock);
      await assert.rejects(start(f.db,f.actor,input(),f.clock),e=>e.code==="attempt_limit");
      assert.equal(await count(f.actor),2);
    });
    await t.test("one request cannot be rebound to another exam/month",async()=>{
      const other=await prepareMockExam(f.db,{examCode:"fe",month:"2039-03"},f.clock);f.trackExam(other.mockExamId);
      await assert.rejects(start(f.db,f.actor,{...aInput,mockExamId:other.mockExamId},f.clock),e=>e.code==="start_request_conflict");
      assert.equal(await f.db.mockAttempt.count({where:{mockExamId:other.mockExamId}}),0);
    });
    await t.test("a closing-boundary resume grades at expiry, records its ID and never silently starts a second attempt",async()=>{
      const actor=f.actors[1];f.setNow(new Date(+closes-60000));
      const a=await start(f.db,actor,input(),f.clock);
      assert.equal(a.attempt.expiresAt,closes.toISOString());
      f.setNow(closes);const resume=input();
      const result=await start(f.other,actor,resume,f.clock);
      assert.equal(result.kind,"result");assert.equal(result.result.attemptId,a.attempt.id);
      assert.equal((await start(f.db,actor,resume,f.clock)).result.attemptId,a.attempt.id);
      assert.equal(await count(actor),1);
      await assert.rejects(start(f.db,f.actors[2],input(),f.clock),e=>e.code==="exam_closed");
      assert.equal(await count(f.actors[2]),0);
    });
    await t.test("teacher, inactive and stale-role users cannot start",async()=>{
      const actor=f.actors[2];f.setNow(initial);
      await assert.rejects(start(f.db,{...actor,roleName:"teacher"},input(),f.clock),e=>e.status===403);
      await f.db.user.update({where:{id:actor.id},data:{status:"inactive"}});
      await assert.rejects(start(f.db,actor,input(),f.clock),e=>e.status===403);
      const teacher=await f.db.role.findUniqueOrThrow({where:{name:"teacher"}});
      const student=await f.db.role.findUniqueOrThrow({where:{name:"student"}});
      await f.db.user.update({where:{id:actor.id},data:{status:"active",roleId:teacher.id}});
      await assert.rejects(start(f.db,actor,input(),f.clock),e=>e.status===403);
      await f.db.user.update({where:{id:actor.id},data:{roleId:student.id}});
      assert.equal(await count(actor),0);
    });
    await t.test("failure after request insertion rolls back the request, attempt and all blank answers",async()=>{
      const actor=f.actors[3],request=input();
      const broken=f.db.$extends({query:{mockAttemptStartRequest:{async create({args,query}){await query(args);throw new Error("Simulated start request write failure");}}}});
      await assert.rejects(start(broken,actor,request,f.clock),/Simulated start request write failure/);
      assert.equal(await count(actor),0);
      assert.equal(await f.db.mockAttemptStartRequest.count({where:{userId:actor.id}}),0);
      assert.equal((await start(f.db,actor,request,f.clock)).attempt.attemptNo,1);
    });
    await t.test("a new start that really waits for a lock past closing creates nothing",async()=>{
      const actor=f.actors[4];f.setNow(new Date(+closes-1));
      let ready,release,heldTx;
      const locked=new Promise(resolve=>{ready=resolve;}),gate=new Promise(resolve=>{release=resolve;});
      const hold=f.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM public.mock_exams WHERE id=${f.mockExamId}::uuid FOR NO KEY UPDATE`;heldTx=tx;ready();await gate;},{maxWait:10000,timeout:30000});
      await locked;const request=input(),pending=start(f.other,actor,request,f.clock),settled=Promise.allSettled([pending]);
      let observed=false;
      try{
        for(let i=0;i<40;i++){
          await heldTx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
          const rows=await heldTx.$queryRaw`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND pg_backend_pid()=ANY(pg_blocking_pids(pid))`;
          if(rows.length){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.equal(observed,true,"new start must be blocked by the independent exam lock");
      }finally{f.setNow(closes);release();await hold;await settled;}
      await assert.rejects(pending,e=>e.code==="exam_closed");
      assert.equal(await count(actor),0);
      assert.equal(await f.db.mockAttemptStartRequest.count({where:{userId:actor.id}}),0);
    });
  });
});
