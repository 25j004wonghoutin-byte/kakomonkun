import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {randomUUID} from "node:crypto";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {withMockDb} from "./helpers/mock-db.mjs";

async function service(){const path=new URL("../src/lib/teacher/mock-exams.ts",import.meta.url);assert.ok(existsSync(path),"teacher-only mock monitoring service must exist");return import(path.href);}
const actor={id:randomUUID(),roleName:"teacher",status:"active",deletedAt:null};
const input={examCode:"fe",month:"2045-01",cursor:null};

test("teacher mock API authenticates every request, validates filters and never shares private responses",async()=>{
  const {createTeacherMockHandler}=await service();let user=null,calls=0,error=null;
  const handler=createTeacherMockHandler({getUser:async()=>user,read:async(a,i)=>{calls++;if(error)throw error;return {actorId:a.id,...i};}});
  const req=query=>new Request(`https://example.invalid/api/teacher/mock-exams${query}`);
  for(const [value,status] of [[null,401],[{...actor,roleName:"student"},403],[{...actor,status:"inactive"},403],[{...actor,deletedAt:new Date()},403]]){
    user=value;const r=await handler(req("?examCode=fe&month=2045-01"));assert.equal(r.status,status);assert.match(r.headers.get("cache-control"),/private, no-store/);assert.match(r.headers.get("vary"),/Cookie/i);
  }
  assert.equal(calls,0);user=actor;
  for(const query of ["?month=2045-01&examCode=bad","?month=2045-13&examCode=fe","?month=2045-01&examCode=fe&cursor=bad","?month=2045-01&examCode=fe&examCode=it_passport","?month=2045-01&examCode=fe&userId=other"]){assert.equal((await handler(req(query))).status,400);}
  assert.equal(calls,0);const r=await handler(req("?month=2045-01&examCode=fe"));assert.equal(r.status,200);assert.deepEqual(await r.json(),{actorId:actor.id,...input});
  error=new Error("private database secret");const failed=await handler(req("?month=2045-01&examCode=fe"));assert.equal(failed.status,500);assert.doesNotMatch(await failed.text(),/private database secret/);
});

test("teacher monitor renders filters, counts and two scores without mutation controls",async()=>{
  const path=new URL("../src/app/teacher/mock-exams/mock-exam-status.tsx",import.meta.url);assert.ok(existsSync(path),"read-only teacher mock view must exist");
  const {MockExamStatus}=await import(path.href);
  const data={examCode:"fe",month:"2045-01",availableMonths:["2045-01"],exam:{id:"mock",title:"基本情報 月次模試",questionCount:60,timeLimitMinutes:90,opensAt:"2044-12-31T15:00:00Z",closesAt:"2045-01-24T15:00:00Z",state:"closed",rankingState:"final",rewardsComplete:true},
    targetStudentCount:101,counts:{not_started:98,in_progress:1,submitted:2},students:[{userId:"u",name:"検証学生",status:"submitted",attempt1Score:50,attempt2Score:75,bestScore:75,rankNo:7}],nextCursor:"next"};
  const html=renderToStaticMarkup(React.createElement(MockExamStatus,{data}));
  for(const text of ["試験種別","対象月","未開始","受験中","提出済み","検証学生","50.00","75.00","7位","次の100人","確定"]){assert.ok(html.includes(text),text);}
  assert.match(html,/cursor=next/);assert.doesNotMatch(html,/手動出題|点数を変更|回数を追加|受験を開始|称号ショップ|マイページ/);
});

test("actual teacher read separates exam/month, classifies once and counts beyond the 100-row page",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:300000},async t=>{
  const {getTeacherMockExams:get}=await service();
  await withMockDb({examCode:"fe",month:"2045-01",userCount:105},async f=>{
    const teacherRole=await f.db.role.findUniqueOrThrow({where:{name:"teacher"}}),teacher={...f.actors[104],roleName:"teacher"};
    await f.db.user.update({where:{id:teacher.id},data:{roleId:teacherRole.id}});
    await f.db.user.update({where:{id:f.actors[102].id},data:{status:"inactive"}});
    await f.db.user.update({where:{id:f.actors[103].id},data:{deletedAt:f.now()}});
    await f.db.user.update({where:{id:f.actors[101].id},data:{createdAt:new Date("2045-02-01")}});
    const ids=f.actors.map(a=>a.id);
    const db=f.db.$extends({query:{user:{count({args,query}){return query({...args,where:{AND:[args.where??{},{id:{in:ids}}]}});},findMany({args,query}){return query({...args,where:{AND:[args.where??{},{id:{in:ids}}]}});}}}});
    async function attempt(index,no,correct,status="submitted",mockExamId=f.mockExamId){
      return f.db.mockAttempt.create({data:{mockExamId,userId:f.actors[index].id,startRequestId:randomUUID(),attemptNo:no,status,startedAt:f.now(),expiresAt:new Date(+f.now()+5400000),totalQuestions:60,correctCount:correct,answeredCount:correct,score:correct/60*100,
        ...(status==="submitted"?{submittedAt:f.now(),gradedAt:f.now()}:{}),}});
    }
    const best=await attempt(0,1,30);await attempt(0,2,45);await attempt(1,1,0,"in_progress");await attempt(3,1,12);await attempt(3,2,0,"in_progress");
    await t.test("teacher only, including freshly disabled database account",async()=>{
      await assert.rejects(get(db,f.actor,input),error=>error.status===403);
      await f.db.user.update({where:{id:teacher.id},data:{status:"inactive"}});
      await assert.rejects(get(db,teacher,input),error=>error.status===403);
      await f.db.user.update({where:{id:teacher.id},data:{status:"active"}});
    });
    await t.test("duplicated page cursor values are rejected before querying records",async()=>{
      await assert.rejects(get(db,teacher,{...input,cursor:[randomUUID()]}),error=>error.status===400);
    });
    let all;
    await t.test("global counts stay identical across two stable pages and in-progress score stays null",async()=>{
      const first=await get(db,teacher,input);assert.equal(first.targetStudentCount,101);assert.deepEqual(first.counts,{not_started:98,in_progress:1,submitted:2});assert.equal(first.students.length,100);assert.ok(first.nextCursor);
      const second=await get(db,teacher,{...input,cursor:first.nextCursor});assert.equal(second.students.length,1);assert.equal(second.nextCursor,null);assert.deepEqual(second.counts,first.counts);
      all=[...first.students,...second.students];assert.equal(new Set(all.map(row=>row.userId)).size,101);
      assert.deepEqual(all.find(row=>row.userId===f.actor.id),{userId:f.actor.id,name:"模擬試験検証 1",status:"submitted",attempt1Score:50,attempt2Score:75,bestScore:75,rankNo:1});
      assert.equal(all.find(row=>row.userId===f.actors[1].id).attempt1Score,null);assert.equal(all.find(row=>row.userId===f.actors[1].id).status,"in_progress");
      assert.equal(all.find(row=>row.userId===f.actors[3].id).status,"submitted");
      assert.doesNotMatch(JSON.stringify(first),/email|correctChoiceId|explanation|selectedChoiceId/);
    });
    await t.test("other exam or month never borrows results and monitoring never grades or pays",async()=>{
      const other=await get(db,teacher,{...input,examCode:"it_passport"});assert.equal(other.exam,null);assert.deepEqual(other.counts,{not_started:101,in_progress:0,submitted:0});assert.ok(other.students.every(row=>row.bestScore===null&&row.rankNo===null));
      const previous=await get(db,teacher,{...input,month:"2044-12"});assert.equal(previous.exam,null);assert.equal(previous.targetStudentCount,0);
      assert.equal(await f.db.mockAttempt.count({where:{mockExamId:f.mockExamId,status:"in_progress"}}),2);
      assert.equal(await f.db.pointTransaction.count({where:{userId:{in:ids}}}),0);assert.equal(await f.db.monthlyRanking.count({where:{mockExamId:f.mockExamId}}),0);
    });
    await t.test("saved final rank is read without recomputing from current scores",async()=>{
      await f.db.mockExam.update({where:{id:f.mockExamId},data:{rankingFinalizedAt:new Date("2045-01-25T00:00:00+09:00")}});
      await f.db.monthlyRanking.create({data:{mockExamId:f.mockExamId,targetMonth:new Date("2045-01-01"),userId:f.actor.id,bestAttemptId:best.id,rankNo:7,mockScore:50,correctCount:30,totalQuestions:60,isFinal:true}});
      const first=await get(db,teacher,input),second=first.nextCursor?await get(db,teacher,{...input,cursor:first.nextCursor}):{students:[]};
      assert.equal([...first.students,...second.students].find(row=>row.userId===f.actor.id).rankNo,7);assert.equal(first.exam.rankingState,"final");
    });
  });
});
