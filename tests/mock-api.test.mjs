import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("private mock API boundary", async t => {
  const path=new URL("../src/lib/mock-exams/handlers.ts",import.meta.url);
  assert.ok(existsSync(path),"mock HTTP handlers must exist");
  const {createMockHandlers}=await import(path.href);
  const {MockError}=await import("../src/lib/mock-exams/contract.ts");
  const keys=["KAKOMON_MOCK_ENABLED","KAKOMON_MOCK_PROJECT_REF","KAKOMON_TEST_ENV","NEXT_PUBLIC_SUPABASE_URL","DATABASE_URL","DIRECT_URL"];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const ref="grzylombpqmidltnbwhx";
  Object.assign(process.env,{KAKOMON_MOCK_ENABLED:"true",KAKOMON_MOCK_PROJECT_REF:ref,KAKOMON_TEST_ENV:"1",NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,DATABASE_URL:`postgresql://postgres:unused@db.${ref}.supabase.co:5432/postgres`,DIRECT_URL:`postgresql://postgres:unused@db.${ref}.supabase.co:5432/postgres`});
  const student={id:randomUUID(),roleName:"student",status:"active",deletedAt:null};
  let user=student,calls=[],failure=null;
  const serviceNames=["getMockList","startMockAttempt","getMockAttempt","saveMockAnswer","submitMockAttempt","getMockResult","getRanking"];
  const services=Object.fromEntries(serviceNames.map(name=>[name,async(...args)=>{calls.push({name,args});if(failure)throw failure;return {kind:name,actorId:args[0].id};}]));
  let authorizations=0;
  const handlers=createMockHandlers({getUser:async()=>{authorizations++;return user;},services});
  const exam=randomUUID(),attempt=randomUUID(),question=randomUUID(),choice=randomUUID();
  const req=(url="?month=2040-01",body,headers={})=>new Request(`https://app.example/api/mock-exams${url}`,body===undefined?{}:{method:"POST",headers:{origin:"https://app.example","content-type":"application/json",...headers},body:typeof body==="string"?body:JSON.stringify(body)});
  const checkPrivate=r=>{assert.equal(r.headers.get("cache-control"),"private, no-store, max-age=0");assert.match(r.headers.get("vary"),/Cookie/i);};
  try {
    await t.test("every entry point authenticates and denies teachers and inactive students",async()=>{
      for(const name of Object.keys(handlers)){
        user=null;const r=await handlers[name](req());assert.equal(r.status,401,name);checkPrivate(r);
        for(const denied of [{...student,roleName:"teacher"},{...student,status:"inactive"},{...student,deletedAt:new Date()}]){
          user=denied;assert.equal((await handlers[name](req())).status,403,name);
        }
      }
      assert.equal(calls.length,0);user=student;
    });
    await t.test("validated inputs reach services with the current actor, never a cached user",async()=>{
      const first=await handlers.list(req());checkPrivate(first);assert.equal(first.status,200);
      user={...student,id:randomUUID()};const second=await handlers.list(req());assert.notEqual((await first.json()).actorId,(await second.json()).actorId);
      await handlers.start(req("",{requestId:randomUUID()}),{mockExamId:exam});
      await handlers.attempt(req(""),{attemptId:attempt});
      await handlers.answer(req("",{mockQuestionId:question,selectedChoiceId:choice,expectedRevision:0,requestId:randomUUID()}),{attemptId:attempt});
      await handlers.submit(req("",{expectedRevision:0}),{attemptId:attempt});
      await handlers.result(req(""),{attemptId:attempt});
      await handlers.ranking(req("?month=2040-01&examCode=fe"));
      assert.deepEqual(calls.map(c=>c.name),["getMockList","getMockList","startMockAttempt","getMockAttempt","saveMockAnswer","submitMockAttempt","getMockResult","getRanking"]);
      assert.equal(calls.at(-1).args[0].id,user.id);assert.ok(authorizations>=calls.length);
      user=student;calls=[];
    });
    await t.test("malformed JSON, unknown keys, IDs, months and revisions never reach services",async()=>{
      const cases=[
        ["list",req("?month=2040-13")],["list",req("?month=0000-01")],["list",req("?month=2040-01&month=2040-02")],["list",req("?month=2040-01&userId=x")],
        ["ranking",req("?month=2040-01&examCode=other")],
        ["attempt",req(""),{attemptId:"bad"}], ["result",req(""),{}],
        ...["{",null,[],{requestId:randomUUID(),userId:student.id},{requestId:"bad"}].map(body=>["start",req("",body),{mockExamId:exam}]),
        ...[-1,0.5,Number.MAX_SAFE_INTEGER+1,"0"].map(expectedRevision=>["submit",req("",{expectedRevision}),{attemptId:attempt}]),
        ["answer",req("",{mockQuestionId:question,selectedChoiceId:"bad",expectedRevision:0,requestId:randomUUID()}),{attemptId:attempt}],
        ["answer",req("",{mockQuestionId:question,expectedRevision:0,requestId:randomUUID()}),{attemptId:attempt}],
        ["submit",req("",{expectedRevision:0,score:100}),{attemptId:attempt}],
      ];
      for(const [name,request,params] of cases){const r=await handlers[name](request,params);assert.equal(r.status,400,name);checkPrivate(r);}
      assert.equal(calls.length,0);
    });
    await t.test("mutations require same Origin, including missing Origin",async()=>{
      for(const origin of ["https://evil.example","null",""]){
        const r=await handlers.start(req("",{requestId:randomUUID()},{origin}),{mockExamId:exam});assert.equal(r.status,403);checkPrivate(r);
      }
      assert.equal(calls.length,0);
    });
    await t.test("same-origin mutations use a validated Host when Next's internal URL differs",async()=>{
      const request=new Request("http://localhost:3001/api/mock-exams/start",{method:"POST",headers:{host:"127.0.0.1:3001",origin:"http://127.0.0.1:3001","content-type":"application/json"},body:JSON.stringify({requestId:randomUUID()})});
      assert.equal((await handlers.start(request,{mockExamId:exam})).status,200);
      calls=[];
      for(const host of ["app.example/path","app.example@evil.example","app.example?x=1"]){
        const bad=await handlers.start(req("",{requestId:randomUUID()},{host}),{mockExamId:exam});assert.equal(bad.status,403);
      }
      assert.equal(calls.length,0);
    });
    await t.test("domain statuses survive but unknown internals are never exposed",async()=>{
      for(const status of [403,404,409,503]){failure=new MockError("domain_error",status,"操作できません。");const r=await handlers.result(req(""),{attemptId:attempt});assert.equal(r.status,status);checkPrivate(r);assert.equal((await r.json()).error,"操作できません。");}
      failure=new Error("postgresql://private:secret@internal Prisma stack");
      const r=await handlers.list(req());assert.equal(r.status,500);checkPrivate(r);assert.doesNotMatch(await r.text(),/secret|Prisma|postgresql/);failure=null;calls=[];
    });
    await t.test("master off stops the API without invoking a feature service",async()=>{
      process.env.KAKOMON_MOCK_ENABLED="false";const r=await handlers.list(req());assert.equal(r.status,503);checkPrivate(r);assert.equal(calls.length,0);
    });
  } finally {for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
});
