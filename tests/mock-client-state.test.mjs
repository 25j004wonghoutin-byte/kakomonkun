import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {randomUUID} from "node:crypto";
import test from "node:test";

const input=(overrides={})=>({attemptId:randomUUID(),mockQuestionId:randomUUID(),selectedChoiceId:randomUUID(),expectedRevision:0,requestId:randomUUID(),...overrides});
async function factory(){const p=new URL("../src/lib/mock-exams/client-state.ts",import.meta.url);assert.ok(existsSync(p),"safe answer queue must exist");return (await import(p.href)).createAnswerQueue;}
test("lost save response stays pending and flush refuses submit even when reload also fails",async()=>{
  const create=await factory();let reloads=0;
  const q=create(async()=>{throw new Error("offline");},async()=>{reloads++;throw new Error("offline");});
  await assert.rejects(q.save(input()),/offline/);assert.equal(q.hasPending(),true);await assert.rejects(q.flush());assert.equal(reloads,1);
});
test("queued rapid changes to one question serialize and rebase only their own acknowledged revision",async()=>{
  const create=await factory();let revision=0,sends=[],release;
  const gate=new Promise(resolve=>{release=resolve;});
  const first=input(),second={...first,selectedChoiceId:randomUUID(),requestId:randomUUID()};
  const q=create(async value=>{sends.push(value);if(sends.length===1)await gate;assert.equal(value.expectedRevision,revision);return {kind:"saved",answer:{mockQuestionId:value.mockQuestionId,selectedChoiceId:value.selectedChoiceId,revision:++revision},attemptRevision:revision,serverNow:"2040-01-02T00:00:00Z"};},async()=>{throw new Error("unexpected reload");});
  const a=q.save(first),b=q.save(second);assert.equal(q.hasPending(),true);release();await Promise.all([a,b]);await q.flush();assert.equal(q.hasPending(),false);assert.deepEqual(sends.map(x=>x.expectedRevision),[0,1]);
});
test("unknown response can retry the identical effective request ID and payload, never a new operation",async()=>{
  const create=await factory();const sent=[];let online=false;const operation=input();
  const q=create(async value=>{sent.push(value);if(!online)throw new Error("lost");return {kind:"saved",answer:{mockQuestionId:value.mockQuestionId,selectedChoiceId:value.selectedChoiceId,revision:1},attemptRevision:1,serverNow:"2040-01-02T00:00:00Z"};},async()=>({kind:"attempt",attempt:{expiresAt:"2040-01-02T01:30:00Z"}}));
  await assert.rejects(q.save(operation));online=true;await q.save(operation);await q.flush();assert.deepEqual(sent[0],sent[1]);assert.equal(q.hasPending(),false);
});
test("409 reloads authoritative state without silently resending or acknowledging the stale choice",async()=>{
  const create=await factory();let sends=0,reloads=0;
  const q=create(async()=>{sends++;throw Object.assign(new Error("updated in another tab"),{status:409});},async()=>{reloads++;return {kind:"attempt",attempt:{expiresAt:"2040-01-02T01:30:00Z"}};});
  await assert.rejects(q.save(input()));await assert.rejects(q.flush());assert.equal(sends,1);assert.equal(reloads,1);assert.equal(q.hasPending(),true);
});
test("deadline response stops later queued writes and never extends the server deadline",async()=>{
  const create=await factory();let sends=0;
  const result={kind:"submitted",result:{attemptId:"done",review:null,submittedAt:"2040-01-02T01:30:00Z"}};
  const q=create(async()=>{sends++;return result;},async()=>{throw new Error("no reload");});
  const results=await Promise.all([q.save(input()),q.save(input())]);assert.deepEqual(results,[result,result]);assert.equal(sends,1);await q.flush();assert.equal(q.hasPending(),false);
});
test("network failures use a Japanese recovery message instead of browser internals",async()=>{
  await factory();const {mockRequest}=await import("../src/lib/mock-exams/client-state.ts");const original=globalThis.fetch;
  try{globalThis.fetch=async()=>{throw new TypeError("Failed to fetch");};await assert.rejects(mockRequest("/api/mock-exams"),e=>/接続/.test(e.message)&&!/Failed to fetch/.test(e.message));}
  finally{globalThis.fetch=original;}
});
