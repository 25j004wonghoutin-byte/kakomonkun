import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import test from "node:test";
const load=async(name)=>{const p=new URL(`../src/lib/mock-exams/${name}.ts`,import.meta.url);assert.ok(existsSync(p),`${name} must exist`);return import(p.href);};
test("best attempts use correct counts, first attempt for ties, and competition ranks include all ties",async()=>{
  const {rankBestAttempts}=await load("ranking");
  const row=(userId,correctCount,attemptNo=1)=>({userId,correctCount,attemptNo,attemptId:`${userId}-${attemptNo}`,totalQuestions:60});
  const ranked=rankBestAttempts([row("d",40),row("a",50,2),row("b",50),row("a",50),row("c",40),row("e",1),row("e",20,2)]);
  assert.deepEqual(ranked.map(r=>[r.userId,r.rankNo,r.attemptNo]),[["a",1,1],["b",1,1],["c",3,1],["d",3,1],["e",5,2]]);
  assert.equal(ranked[0].score,83.33);assert.equal(ranked.filter(r=>r.rankNo<=3).length,4);
});
test("a zero-score single participant is still first, and zero ties are not excluded",async()=>{
  const {rankBestAttempts}=await load("ranking");
  const one={userId:"one",attemptId:"a",attemptNo:1,correctCount:0,totalQuestions:60};
  assert.deepEqual(rankBestAttempts([one]).map(r=>[r.rankNo,r.score]),[[1,0]]);
  assert.deepEqual(rankBestAttempts([one,{...one,userId:"two",attemptId:"b"}]).map(r=>[r.rankNo,r.score]),[[1,0],[1,0]]);
});
test("polling refreshes visible pages every 15 seconds, on show, never concurrently, and unsubscribes",async t=>{
  const {startRankingPolling}=await load("ranking-poll");
  t.mock.timers.enable({apis:["setInterval"]});
  let visible=true,callback,unsubscribed=false,calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const stop=startRankingPolling({refresh:async()=>{calls++;if(calls===1)await gate;},visibility:()=>visible,subscribe:fn=>{callback=fn;return()=>{unsubscribed=true;};}});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(14999);await settle();assert.equal(calls,0);
  t.mock.timers.tick(1);await settle();assert.equal(calls,1);
  t.mock.timers.tick(45000);await settle();assert.equal(calls,1);
  release();await settle();visible=false;callback();t.mock.timers.tick(30000);await settle();assert.equal(calls,1);
  visible=true;callback();await settle();assert.equal(calls,2);
  t.mock.timers.tick(15000);await settle();assert.equal(calls,3);
  stop();assert.equal(unsubscribed,true);t.mock.timers.tick(30000);callback();await settle();assert.equal(calls,3);
});
test("a late previous-month response cannot replace a newer month or an unmounted view",async()=>{
  const {createRankingLoader}=await load("ranking-poll");const waits=new Map(),published=[];
  const loader=createRankingLoader(key=>new Promise(resolve=>waits.set(key,resolve)),value=>published.push(value));
  const older=loader.refresh("old"),newer=loader.refresh("new");
  waits.get("new")({month:"2040-02"});await newer;waits.get("old")({month:"2040-01"});await older;
  assert.deepEqual(published,[{month:"2040-02"}]);
  const last=loader.refresh("last");loader.dispose();waits.get("last")({month:"2040-03"});await last;assert.equal(published.length,1);
});

test("ranking DTO counts submitted people once, includes lower ranks and uses the DB clock's Tokyo month",async()=>{
  const {getMockRanking}=await load("ranking");
  const ref="grzylombpqmidltnbwhx",connection=`postgresql://postgres:fixture@db.${ref}.supabase.co:5432/postgres`;
  const env={KAKOMON_MOCK_ENABLED:"true",KAKOMON_MOCK_PROJECT_REF:ref,NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,DATABASE_URL:connection,DIRECT_URL:connection};
  const before=new Map(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  try{
    const actor={id:"e",roleName:"student",status:"active",deletedAt:null};
    const attempts=[...[50,40,30,20,10].map((correctCount,i)=>({id:`attempt-${i}`,userId:"abcde"[i],attemptNo:1,correctCount,totalQuestions:60})),{id:"second",userId:"a",attemptNo:2,correctCount:50,totalQuestions:60}];
    let finalized=false;
    const tx={
      user:{findUnique:async()=>({status:"active",deletedAt:null,role:{name:"student"}}),findMany:async()=>[..."abcde"].map(id=>({id,displayName:`学生${id}`,status:"active",deletedAt:null,role:{name:"student"},studentProfile:{avatarUrl:null,currentTitle:null}}))},
      mockExam:{findFirst:async()=>({id:"exam",rankingFinalizedAt:finalized?new Date("2040-02-25T00:00:00Z"):null}),findUniqueOrThrow:async()=>({id:"exam",rankingFinalizedAt:finalized?new Date("2040-02-25T00:00:00Z"):null,rewardsCompletedAt:null}),findMany:async()=>[{targetMonth:new Date("2040-02-01T00:00:00Z")}]},
      mockAttempt:{findMany:async args=>args.where.status==="in_progress"?[]:attempts,count:async()=>0},
      monthlyRanking:{findMany:async()=>attempts.filter(r=>r.attemptNo===1).map((r,i)=>({userId:r.userId,bestAttemptId:r.id,rankNo:i+1,mockScore:r.correctCount/60*100,correctCount:r.correctCount,totalQuestions:60,bestAttempt:{attemptNo:1}}))},
    };
    const db={$transaction:async callback=>callback(tx)};
    const clock=async()=>new Date("2040-02-29T15:00:00Z");
    const live=await getMockRanking(db,actor,"fe","2040-02",clock);
    assert.equal(live.participantCount,5,"six submissions by five people must count as five participants");
    assert.equal(live.currentMonth,"2040-03","DB time at midnight JST, not the browser's local month");
    assert.equal(live.mine.rankNo,5);
    finalized=true;
    const final=await getMockRanking(db,actor,"fe","2040-02",clock);
    assert.equal(final.participantCount,5,"final denominator is based on the saved final ranking");
    assert.equal(final.state,"final");
  }finally{
    for(const [key,value]of before){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
