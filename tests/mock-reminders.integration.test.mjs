import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import test from "node:test";
import {withMockDb} from "./helpers/mock-db.mjs";
import {getMockSchedule} from "../src/lib/mock-exams/schedule.ts";

// Candidate reads retain every production predicate AND the disposable fixture IDs.
const scoped=f=>f.db.$extends({query:{user:{findMany({args,query}){return query({...args,where:{AND:[args.where??{},{id:{in:f.actors.map(a=>a.id)}}]}});}}}});
async function attempt(f,actor,mockExamId,status="submitted",totalQuestions=60){
  const startedAt=new Date(+f.now()-60000),expiresAt=new Date(+startedAt+5400000);
  return f.db.mockAttempt.create({data:{mockExamId,userId:actor.id,startRequestId:randomUUID(),attemptNo:1,startedAt,expiresAt,totalQuestions,status,
    ...(status==="submitted"?{submittedAt:f.now(),gradedAt:f.now()}:{}),}});
}

test("monthly reminders are cutoff-safe, once-only and bounded to eligible unsubmitted students",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:600000},async t=>{
  const path=new URL("../src/lib/mock-exams/reminders.ts",import.meta.url);assert.ok(existsSync(path),"bounded monthly reminder service must exist");
  const {sendMockRemindersBatch:send}=await import(path.href);
  await withMockDb({examCode:"fe",month:"2044-01",userCount:9},async f=>{
    const db=scoped(f),schedule=getMockSchedule("2044-01");
    f.setNow(schedule.reminderAt);
    await attempt(f,f.actors[1],f.mockExamId,"in_progress");await attempt(f,f.actors[2],f.mockExamId);
    const otherExam=await f.db.exam.findUniqueOrThrow({where:{code:"it_passport"}}),id=randomUUID();f.trackExam(id);
    await f.db.mockExam.create({data:{id,examId:otherExam.id,title:`QA reminders ${f.runId}`,targetMonth:new Date("2044-01-01"),questionCount:100,timeLimitMinutes:120,status:"ready",availableFrom:schedule.opensAt,availableUntil:schedule.closesAt,createdBy:f.actor.id}});
    await attempt(f,f.actors[3],id,"submitted",100);
    const teacher=await f.db.role.findUniqueOrThrow({where:{name:"teacher"}});
    await f.db.user.update({where:{id:f.actors[4].id},data:{status:"inactive"}});
    await f.db.user.update({where:{id:f.actors[5].id},data:{roleId:teacher.id}});
    await f.db.user.update({where:{id:f.actors[6].id},data:{deletedAt:f.now()}});
    await f.db.user.update({where:{id:f.actors[7].id},data:{createdAt:new Date(+schedule.reminderAt+1)}});
    await f.db.user.update({where:{id:f.actors[8].id},data:{createdAt:schedule.reminderAt}});
    await t.test("one millisecond before reminder time sends nothing",async()=>{
      f.setNow(new Date(+schedule.reminderAt-1));assert.deepEqual(await send(db,"2044-01",null,f.clock),{sent:0,nextCursor:null});
      assert.equal(await f.db.notification.count({where:{recipientId:{in:f.actors.map(a=>a.id)}}}),0);
    });
    await t.test("at scheduled time never-started and active attempts qualify, either submitted exam excludes",async()=>{
      f.setNow(schedule.reminderAt);assert.deepEqual(await send(db,"2044-01",null,f.clock),{sent:3,nextCursor:null});
      const rows=await f.db.notification.findMany({where:{recipientId:{in:f.actors.map(a=>a.id)},type:"mock_exam_reminder"}});
      assert.deepEqual(new Set(rows.map(r=>r.recipientId)),new Set([f.actor.id,f.actors[1].id,f.actors[8].id]));
      assert.ok(rows.every(row=>row.targetMonth.toISOString().slice(0,7)==="2044-01"&&row.readAt===null));
      assert.deepEqual(await send(db,"2044-01",null,f.clock),{sent:0,nextCursor:null});
    });
    await t.test("retry on independent clients never duplicates and close suppresses previously unnotified students",async()=>{
      const pair=await Promise.all([send(db,"2044-01",null,f.clock),send(scoped({...f,db:f.other}),"2044-01",null,f.clock)]);
      assert.equal(pair.reduce((sum,row)=>sum+row.sent,0),0);
      await f.db.user.update({where:{id:f.actors[4].id},data:{status:"active"}});
      f.setNow(schedule.closesAt);assert.deepEqual(await send(db,"2044-01",null,f.clock),{sent:0,nextCursor:null});
      assert.equal(await f.db.notification.count({where:{recipientId:f.actors[4].id}}),0);
    });
    await t.test("existing individual-read ownership filter works for the month reminder",async()=>{
      const {notificationReadWhere}=await import("../src/lib/notifications/write.ts");
      const notice=await f.db.notification.findFirstOrThrow({where:{recipientId:f.actor.id,type:"mock_exam_reminder"}});
      assert.equal((await f.db.notification.updateMany({where:notificationReadWhere(f.actors[1].id,notice.id),data:{readAt:f.now()}})).count,0);
      assert.equal((await f.db.notification.updateMany({where:notificationReadWhere(f.actor.id,notice.id),data:{readAt:f.now()}})).count,1);
      assert.ok((await f.db.notification.findUniqueOrThrow({where:{id:notice.id}})).readAt);
    });
  });
  await t.test("send-time transaction rechecks candidate account and submission changes",async()=>{
    await withMockDb({examCode:"fe",month:"2044-02"},async f=>{
      f.setNow(getMockSchedule("2044-02").reminderAt);
      const db=scoped(f).$extends({query:{user:{async findMany({args,query}){const rows=await query(args);
        await f.db.user.update({where:{id:f.actor.id},data:{status:"inactive"}});await attempt(f,f.actors[1],f.mockExamId);return rows;}}}});
      assert.deepEqual(await send(db,"2044-02",null,f.clock),{sent:0,nextCursor:null});
      assert.equal(await f.db.notification.count({where:{recipientId:{in:f.actors.map(a=>a.id)}}}),0);
    });
  });
  await t.test("actual insert fault rolls back and parallel retries insert once",async()=>{
    await withMockDb({examCode:"fe",month:"2044-03",userCount:1},async f=>{
      f.setNow(getMockSchedule("2044-03").reminderAt);
      const broken=scoped(f).$extends({query:{notification:{async createMany({args,query}){await query(args);throw new Error("Fault after reminder insertion");}}}});
      await assert.rejects(send(broken,"2044-03",null,f.clock),/Fault after reminder insertion/);
      assert.equal(await f.db.notification.count({where:{recipientId:f.actor.id}}),0);
      const pair=await Promise.all([send(scoped(f),"2044-03",null,f.clock),send(scoped({...f,db:f.other}),"2044-03",null,f.clock)]);
      assert.equal(pair.reduce((sum,row)=>sum+row.sent,0),1);assert.equal(await f.db.notification.count({where:{recipientId:f.actor.id}}),1);
    });
  });
  await t.test("101 students advance as 100 then 1 using stable UUID cursor",async()=>{
    await withMockDb({examCode:"fe",month:"2044-04",userCount:101},async f=>{
      f.setNow(getMockSchedule("2044-04").reminderAt);const db=scoped(f),sorted=f.actors.map(a=>a.id).sort();
      const first=await send(db,"2044-04",null,f.clock);assert.deepEqual(first,{sent:100,nextCursor:sorted[99]});
      assert.equal(await f.db.notification.count({where:{recipientId:{in:sorted}}}),100);
      assert.deepEqual(await send(db,"2044-04",first.nextCursor,f.clock),{sent:1,nextCursor:null});
      assert.equal(await f.db.notification.count({where:{recipientId:{in:sorted}}}),101);
    });
  });
  await t.test("post-lock deadline and invalid inputs fail closed without inserting notices",async()=>{
    await withMockDb({examCode:"fe",month:"2044-05",userCount:1},async f=>{
      const schedule=getMockSchedule("2044-05");f.setNow(schedule.reminderAt);
      let calls=0;const crossingClock=async()=>++calls===1?schedule.reminderAt:schedule.closesAt;
      assert.deepEqual(await send(scoped(f),"2044-05",null,crossingClock),{sent:0,nextCursor:null});
      assert.equal(calls,2);assert.equal(await f.db.notification.count({where:{recipientId:f.actor.id}}),0);
      await assert.rejects(send(scoped(f),"2044-05","invalid",f.clock),error=>error.status===400&&error.code==="invalid_cursor");
      await assert.rejects(send(scoped(f),"2044-13",null,f.clock),error=>error.status===400&&error.code==="invalid_month");
      const enabled=process.env.KAKOMON_MOCK_ENABLED;
      try{process.env.KAKOMON_MOCK_ENABLED="false";await assert.rejects(send(scoped(f),"2044-05",null,f.clock),error=>error.status===503&&error.code==="mock_disabled");}
      finally{process.env.KAKOMON_MOCK_ENABLED=enabled;}
    });
  });
});
