import assert from "node:assert/strict";
import {createHash,createHmac,randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import test from "node:test";
import {withMockDb} from "./helpers/mock-db.mjs";

test("job leases fence stale workers, retry safely and keep business progress",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:600000},async t=>{
  const path=new URL("../src/lib/mock-exams/jobs.ts",import.meta.url);assert.ok(existsSync(path),"resumable bounded job worker must exist");
  const {claimMockJob:claim,finishMockJob:finish,runMockJobs:run,cleanMockJobMetadata:clean}=await import(path.href);
  await withMockDb({examCode:"fe",month:"2046-01",userCount:2},async f=>{
    const months=[new Date("2046-01-01"),new Date("2046-02-01")],ownedIds=new Set(),nonces=[];
    if(await f.db.mockExamJobRun.count({where:{targetMonth:{in:months}}}))throw Error("job fixture refuses existing month records");
    const scoped=client=>client.$extends({query:{
      user:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{id:{in:f.actors.map(a=>a.id)}}]}});}},
      question:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{sourceKey:{startsWith:`mock-qa:${f.runId}:`}}]}});}},
      mockExam:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{OR:[{id:f.mockExamId},{createdBy:f.actor.id,targetMonth:{in:months}}]}]}});}},
      mockAttempt:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{userId:{in:f.actors.map(a=>a.id)}}]}});}},
      mockExamJobRun:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{targetMonth:{in:months},OR:[{examCode:"fe"},{kind:"remind"}]}]}});}},
    }});
    const db=scoped(f.db),priorJobs=process.env.KAKOMON_MOCK_JOBS_ENABLED;process.env.KAKOMON_MOCK_JOBS_ENABLED="true";
    const ownJob=async(suffix,data={})=>{const row=await f.db.mockExamJobRun.create({data:{jobKey:`qa:${f.runId}:${suffix}`,kind:"prepare",targetMonth:months[0],examCode:"fe",nextRunAt:f.now(),...data}});ownedIds.add(row.id);return row;};
    try{
      await t.test("only one live lease; exact expiry permits takeover and old completion cannot overwrite cursor",async()=>{
        const job=await ownJob("lease"),a=await claim(f.db,job.id,f.clock);assert.ok(a.leaseToken);assert.equal(await claim(f.other,job.id,f.clock),null);
        f.setNow(new Date(+f.now()+120000));const b=await claim(f.other,job.id,f.clock);assert.notEqual(a.leaseToken,b.leaseToken);
        assert.equal(await finish(f.db,a,{done:true,cursor:"stale"},f.clock),false);
        assert.equal(await finish(f.other,b,{done:false,cursor:"new-cursor"},f.clock),true);
        assert.equal(await finish(f.db,a,{done:true,cursor:"stale"},f.clock),false);
        const row=await f.db.mockExamJobRun.findUniqueOrThrow({where:{id:job.id}});assert.equal(row.cursor,"new-cursor");assert.equal(row.status,"pending");assert.equal(row.completedAt,null);
        const c=await claim(f.db,job.id,f.clock);assert.ok(c);await finish(f.db,c,{done:true},f.clock);
        const raced=await ownJob("parallel-claim"),claims=await Promise.all([claim(f.db,raced.id,f.clock),claim(f.other,raced.id,f.clock)]);
        assert.equal(claims.filter(Boolean).length,1);await finish(f.db,claims.find(Boolean),{done:true},f.clock);
      });
      await t.test("retry delays are one five fifteen then at most sixty minutes",async()=>{
        const job=await ownJob("retry");
        for(const minutes of [1,5,15,60,60]){const lease=await claim(f.db,job.id,f.clock);assert.ok(lease);assert.equal(await finish(f.db,lease,{done:false,errorCode:"job_failed"},f.clock),true);
          const row=await f.db.mockExamJobRun.findUniqueOrThrow({where:{id:job.id}});assert.equal(+row.nextRunAt-+f.now(),minutes*60000);assert.equal(row.status,"failed");assert.equal(await claim(f.other,job.id,f.clock),null);f.setNow(row.nextRunAt);}
        const final=await claim(f.db,job.id,f.clock);await finish(f.db,final,{done:true},f.clock);
      });
      await t.test("nonce is atomically consumed and authenticated disabled requests cannot replay",async()=>{
        const {consumeMockJobNonce:consume,createMockJobHandler}=await import("../src/lib/mock-exams/job-auth.ts");
        const nonce=randomUUID();nonces.push(nonce);const pair=await Promise.allSettled([consume(f.db,nonce,f.now()),consume(f.other,nonce,f.now())]);assert.equal(pair.filter(row=>row.status==="fulfilled").length,1);
        const env={...process.env,KAKOMON_MOCK_JOB_SECRET:"ephemeral-job-http-fixture-0123456789",KAKOMON_MOCK_ENVIRONMENT:"test",KAKOMON_MOCK_JOBS_ENABLED:"false"};let runs=0;
        const handler=createMockJobHandler({database:async()=>f.db,environment:()=>env,clock:f.clock,run:async()=>{runs++;return {processed:1,failed:0,remaining:true};}});
        const n=randomUUID();nonces.push(n);const body='{"action":"tick"}',seconds=Math.floor(+f.now()/1000);
        const make=()=>new Request("https://app.example/api/internal/mock-exams/tick",{method:"POST",body,headers:{"content-type":"application/json","x-mock-time":String(seconds),"x-mock-nonce":n,"x-mock-project":"grzylombpqmidltnbwhx","x-mock-environment":"test","x-mock-signature":createHmac("sha256",env.KAKOMON_MOCK_JOB_SECRET).update(`POST\n/api/internal/mock-exams/tick\ngrzylombpqmidltnbwhx\ntest\n${seconds}\n${n}\n${createHash("sha256").update(body).digest("hex")}`).digest("hex")}});
        assert.equal((await handler(make())).status,503);assert.equal((await handler(make())).status,409);assert.equal(runs,0);
        env.KAKOMON_MOCK_JOBS_ENABLED="true";const next=randomUUID();nonces.push(next);
        const request=make(),headers=new Headers(request.headers);headers.set("x-mock-nonce",next);headers.set("x-mock-signature",createHmac("sha256",env.KAKOMON_MOCK_JOB_SECRET).update(`POST\n/api/internal/mock-exams/tick\ngrzylombpqmidltnbwhx\ntest\n${seconds}\n${next}\n${createHash("sha256").update(body).digest("hex")}`).digest("hex"));
        const response=await handler(new Request(request,{headers}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{processed:1,failed:0,remaining:true});assert.equal(runs,1);
        assert.equal((await handler(new Request("https://app.example/api/internal/mock-exams/tick",{method:"POST",headers:{cookie:"teacher"},body}))).status,401);
      });
      await t.test("due grading runs before preparation, one bounded work item per tick and replays do not pay twice",async()=>{
        f.setNow(new Date("2046-01-20T09:00:00+09:00"));
        await f.db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId:f.actor.id,startRequestId:randomUUID(),attemptNo:1,startedAt:new Date("2046-01-02T00:00:00+09:00"),expiresAt:new Date("2046-01-02T01:30:00+09:00"),totalQuestions:60}});
        const first=await run(db,f.clock);assert.equal(first.processed,1);assert.equal(first.failed,0);assert.equal(first.remaining,true);
        assert.equal(await f.db.mockAttempt.count({where:{mockExamId:f.mockExamId,status:"in_progress"}}),0);assert.equal(await f.db.pointTransaction.count({where:{userId:f.actor.id,reason:"mock_participation"}}),1);
        const concurrent=await Promise.all([run(db,f.clock),run(scoped(f.other),f.clock)]);assert.ok(concurrent.every(row=>row.failed===0));
        for(let i=0;i<4;i++)await run(db,f.clock);
        assert.equal(await f.db.pointTransaction.count({where:{userId:f.actor.id,reason:"mock_participation"}}),1);
        assert.equal(await f.db.notification.count({where:{recipientId:f.actors[1].id,type:"mock_exam_reminder"}}),1);
        assert.equal(await f.db.notification.count({where:{recipientId:f.actor.id,type:"mock_exam_reminder"}}),0);
      });
      await t.test("late cutoff prepares next month once and settles current ranks without late reminders",async()=>{
        f.setNow(new Date("2046-01-25T00:00:00+09:00"));
        for(let i=0;i<6;i++)await run(db,f.clock);
        const future=await f.db.mockExam.findFirstOrThrow({where:{examId:f.examId,targetMonth:months[1]}});f.trackExam(future.id);
        const before=await f.db.mockExamQuestion.findMany({where:{mockExamId:future.id},orderBy:{orderNo:"asc"},select:{id:true,questionId:true,orderNo:true}});
        assert.equal(before.length,60);await run(db,f.clock);
        assert.deepEqual(await f.db.mockExamQuestion.findMany({where:{mockExamId:future.id},orderBy:{orderNo:"asc"},select:{id:true,questionId:true,orderNo:true}}),before);
        const exam=await f.db.mockExam.findUniqueOrThrow({where:{id:f.mockExamId}});assert.ok(exam.rankingFinalizedAt);assert.ok(exam.rewardsCompletedAt);
        assert.equal(await f.db.pointTransaction.count({where:{userId:f.actor.id,reason:"mock_rank_reward"}}),1);
        assert.equal(await f.db.mockExam.count({where:{createdBy:f.actor.id,targetMonth:{lt:months[0]}}}),0);
      });
      await t.test("old error details clear without deleting business keys or completion dates",async()=>{
        const completed=new Date("2045-01-01"),row=await ownJob("retention",{status:"completed",completedAt:completed,lastErrorAt:completed,lastErrorCode:"old_error"});
        await clean(db,f.now());const saved=await f.db.mockExamJobRun.findUniqueOrThrow({where:{id:row.id}});assert.equal(saved.jobKey,row.jobKey);assert.equal(+saved.completedAt,+completed);assert.equal(saved.lastErrorAt,null);assert.equal(saved.lastErrorCode,null);
        assert.equal(await f.db.mockExamJobRun.count({where:{jobKey:{in:nonces.map(n=>`mock-dispatch:${n}`)}}}),0);
      });
    }finally{
      process.env.KAKOMON_MOCK_JOBS_ENABLED=priorJobs;
      for(const row of await f.db.mockExam.findMany({where:{createdBy:f.actor.id,targetMonth:{in:months}}}))if(row.id!==f.mockExamId)f.trackExam(row.id);
      for(const row of await f.db.mockExamJobRun.findMany({where:{targetMonth:{in:months}}}))ownedIds.add(row.id);
      await f.db.mockExamJobRun.deleteMany({where:{OR:[{id:{in:[...ownedIds]}},{jobKey:{in:nonces.map(n=>`mock-dispatch:${n}`)}}]}});
    }
  });
});

test("a worker stopped after business commit reclaims its expired lease without duplicate participation",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:300000},async()=>{
  const {claimMockJob:claim,runMockJobs:run}=await import("../src/lib/mock-exams/jobs.ts");
  const {settleExpiredMockAttempts:grade}=await import("../src/lib/mock-exams/ranking.ts");
  await withMockDb({examCode:"fe",month:"2046-04",userCount:1},async f=>{
    const month=new Date("2046-04-01");if(await f.db.mockExamJobRun.count({where:{targetMonth:month}}))throw Error("job fixture refuses existing records");
    const oldJobs=process.env.KAKOMON_MOCK_JOBS_ENABLED;process.env.KAKOMON_MOCK_JOBS_ENABLED="true";
    try{
      await f.db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId:f.actor.id,startRequestId:randomUUID(),attemptNo:1,startedAt:f.now(),expiresAt:new Date(+f.now()+5400000),totalQuestions:60}});
      f.setNow(new Date("2046-04-03T00:00:00+09:00"));
      const job=await f.db.mockExamJobRun.create({data:{jobKey:`mock:grade:${f.mockExamId}`,kind:"grade",targetMonth:month,examCode:"fe",nextRunAt:f.now()}});
      const lease=await claim(f.db,job.id,f.clock);assert.ok(lease);
      await grade(f.db,f.mockExamId,25,f.clock);assert.equal(await f.db.pointTransaction.count({where:{userId:f.actor.id,reason:"mock_participation"}}),1);
      f.setNow(new Date(+f.now()+120000));
      const scoped=f.db.$extends({query:{mockExam:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{id:f.mockExamId}]}});}},mockExamJobRun:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{targetMonth:month}]}});}}}});
      const result=await run(scoped,f.clock);assert.equal(result.processed,1);assert.equal(result.failed,0);
      const done=await f.db.mockExamJobRun.findUniqueOrThrow({where:{id:job.id}});assert.equal(done.status,"completed");assert.equal(done.attempts,2);
      assert.equal(await f.db.pointTransaction.count({where:{userId:f.actor.id,reason:"mock_participation"}}),1);
    }finally{process.env.KAKOMON_MOCK_JOBS_ENABLED=oldJobs;await f.db.mockExamJobRun.deleteMany({where:{targetMonth:month}});}
  });
});

test("cooperative worker budget stops between students without skipping remaining work",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:300000},async()=>{
  const {settleExpiredMockAttempts:grade}=await import("../src/lib/mock-exams/ranking.ts");
  const {settleMockExamBatch:settle}=await import("../src/lib/mock-exams/settlement.ts");
  const {sendMockRemindersBatch:remind}=await import("../src/lib/mock-exams/reminders.ts");
  await withMockDb({examCode:"fe",month:"2046-03",userCount:3},async f=>{
    await f.db.mockAttempt.createMany({data:f.actors.map(a=>({mockExamId:f.mockExamId,userId:a.id,startRequestId:randomUUID(),attemptNo:1,startedAt:f.now(),expiresAt:new Date(+f.now()+5400000),totalQuestions:60}))});
    f.setNow(new Date("2046-03-20T09:00:00+09:00"));
    const db=f.db.$extends({query:{user:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{id:{in:f.actors.map(a=>a.id)}}]}});}}}});
    const notification=await remind(db,"2046-03",null,f.clock,()=>false);
    assert.deepEqual(notification,{sent:1,nextCursor:f.actors.map(a=>a.id).sort()[0]});
    assert.equal(await grade(f.db,f.mockExamId,25,f.clock,()=>false),0);
    let checks=0;assert.equal(await grade(f.db,f.mockExamId,25,f.clock,()=>checks++<1),1);
    f.setNow(new Date("2046-03-25T00:00:00+09:00"));
    assert.deepEqual(await settle(f.db,f.mockExamId,f.clock,()=>false),{phase:"grading",remaining:2});
    assert.deepEqual(await settle(f.db,f.mockExamId,f.clock),{phase:"ranked",remaining:3});
    checks=0;assert.deepEqual(await settle(f.db,f.mockExamId,f.clock,()=>checks++<1),{phase:"ranked",remaining:2});
    assert.equal(await f.db.pointTransaction.count({where:{userId:{in:f.actors.map(a=>a.id)},reason:"mock_rank_reward"}}),1);
  });
});

test("a retried preparation job cannot create a never-held past exam after the monthly preparation window",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:300000},async()=>{
  const {runMockJobs:run}=await import("../src/lib/mock-exams/jobs.ts");
  await withMockDb({examCode:"fe",month:"2048-01",userCount:1,prepared:false},async f=>{
    const months=[new Date("2048-01-01"),new Date("2048-02-01"),new Date("2048-03-01")];
    assert.equal(await f.db.mockExam.count({where:{examId:f.examId,targetMonth:{in:months}}}),0,"fixture refuses existing month exams");
    assert.equal(await f.db.mockExamJobRun.count({where:{targetMonth:{in:months}}}),0,"fixture refuses existing month jobs");
    const db=f.db.$extends({query:{
      question:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{sourceKey:{startsWith:`mock-qa:${f.runId}:`}}]}});}},
      mockAttempt:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{userId:f.actor.id}]}});}},
      mockExam:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{examId:f.examId,targetMonth:{in:months}}]}});}},
      mockExamJobRun:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{targetMonth:{in:months},examCode:"fe"}]}});}},
    }});
    const oldJobs=process.env.KAKOMON_MOCK_JOBS_ENABLED;process.env.KAKOMON_MOCK_JOBS_ENABLED="true";
    try{
      const obsolete=await f.db.mockExamJobRun.create({data:{jobKey:"mock:prepare:2048-01:fe",kind:"prepare",targetMonth:months[0],examCode:"fe",status:"failed",attempts:1,nextRunAt:f.now(),lastErrorCode:"pool_shortage",lastErrorAt:f.now()}});
      const pending=await f.db.mockExamJobRun.create({data:{jobKey:`qa:${f.runId}:old-pending`,kind:"prepare",targetMonth:months[0],examCode:"fe",status:"pending",nextRunAt:new Date(+f.now()+1)}});
      const expired=await f.db.mockExamJobRun.create({data:{jobKey:`qa:${f.runId}:old-running`,kind:"prepare",targetMonth:months[0],examCode:"fe",status:"running",nextRunAt:new Date(+f.now()+2),leaseToken:randomUUID(),leaseUntil:new Date(+f.now()+120000)}});
      const future=await f.db.mockExamJobRun.create({data:{jobKey:"mock:prepare:2048-03:fe",kind:"prepare",targetMonth:months[2],examCode:"fe",nextRunAt:new Date(+f.now()-1000)}});
      f.setNow(new Date("2048-01-25T00:00:00+09:00"));
      assert.equal((await run(db,f.clock)).failed,0);
      assert.equal(await f.db.mockExam.count({where:{examId:f.examId,targetMonth:months[0]}}),0,"never create an exam whose publication window already ended");
      const retired=await f.db.mockExamJobRun.findUniqueOrThrow({where:{id:obsolete.id}});
      assert.equal(retired.status,"completed");assert.ok(retired.completedAt);
      f.setNow(new Date("2048-02-02T00:00:00+09:00"));
      for(const job of [pending,expired]){
        assert.equal((await run(db,f.clock)).failed,0);
        assert.equal((await f.db.mockExamJobRun.findUniqueOrThrow({where:{id:job.id}})).status,"completed");
        assert.equal(await f.db.mockExam.count({where:{examId:f.examId,targetMonth:months[0]}}),0);
      }
      await run(db,f.clock);
      const next=await f.db.mockExam.findFirstOrThrow({where:{examId:f.examId,targetMonth:months[1]}});f.trackExam(next.id);
      assert.equal(await f.db.mockExamQuestion.count({where:{mockExamId:next.id}}),60);
      assert.equal(await f.db.monthlyRanking.count({where:{targetMonth:months[0],userId:f.actor.id}}),0);
      assert.equal((await f.db.mockExamJobRun.findUniqueOrThrow({where:{id:future.id}})).status,"pending","future preparation waits for its own window");
      assert.equal(await f.db.mockExam.count({where:{examId:f.examId,targetMonth:months[2]}}),0);
    }finally{
      process.env.KAKOMON_MOCK_JOBS_ENABLED=oldJobs;
      for(const row of await f.db.mockExam.findMany({where:{examId:f.examId,targetMonth:{in:months}}}))f.trackExam(row.id);
      await f.db.mockExamJobRun.deleteMany({where:{targetMonth:{in:months}}});
    }
  });
});
