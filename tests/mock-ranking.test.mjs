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
