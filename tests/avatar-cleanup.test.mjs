import assert from "node:assert/strict";
import test from "node:test";
import { createAvatarRef } from "../src/lib/avatars/contract.ts";
import { createAvatarMemory } from "./helpers/avatar-memory.mjs";
let cleanup={};
try{cleanup=await import("../src/lib/avatars/cleanup.ts");}catch(e){if(e.code!=="ERR_MODULE_NOT_FOUND")throw e;}
const ref=createAvatarRef("11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222");
const createdAt=new Date("2026-10-10T00:00:00Z");
test("avatar cleanup never removes an object before 24 hours or while it is current",async()=>{
  assert.equal(typeof cleanup.cleanupAvatarObject,"function");const m=createAvatarMemory(null);m.objects.set(ref.key,new Uint8Array([1]));
  assert.equal(await cleanup.cleanupAvatarObject({...m,ref,now:new Date(createdAt.getTime()+86400000-1)}),"deferred");
  m.state.avatarUrl=ref.url;
  assert.equal(await cleanup.cleanupAvatarObject({...m,ref,now:new Date(createdAt.getTime()+86400000)}),"current");
  assert.equal(m.objects.has(ref.key),true);
  m.state.avatarUrl=null;
  assert.equal(await cleanup.cleanupAvatarObject({...m,ref,now:new Date(createdAt.getTime()+86400000)}),"deleted");
  assert.equal(m.objects.has(ref.key),false);
});
test("avatar cleanup refuses unknown owners, malformed keys, unavailable locks and failed deletion",async()=>{
  assert.equal(typeof cleanup.cleanupAvatarObject,"function");const m=createAvatarMemory(null);m.objects.set(ref.key,new Uint8Array([1]));
  const now=new Date("2026-10-12T00:00:00Z");
  m.hooks.check=async()=>{throw new Error("lock unavailable");};
  assert.equal(await cleanup.cleanupAvatarObject({...m,ref,now}),"deferred");
  m.hooks.check=async()=>false;
  assert.equal(await cleanup.cleanupAvatarObject({...m,ref,now}),"current");
  m.hooks.check=async()=>true;m.hooks.remove=async()=>{throw new Error("down");};
  assert.equal(await cleanup.cleanupAvatarObject({...m,ref,now}),"deferred");
  assert.equal(await cleanup.cleanupAvatarObject({...m,ref:{...ref,key:"../foreign/file"},now}),"deferred");
  assert.equal(m.objects.has(ref.key),true);
});
test("read-only avatar candidates require a known owner and remain candidates until locked recheck",async()=>{
  assert.equal(typeof cleanup.listAvatarCleanupCandidates,"function");const m=createAvatarMemory(null);m.objects.set(ref.key,new Uint8Array([1]));
  const entries=await cleanup.listAvatarCleanupCandidates({...m,now:new Date("2026-10-12T00:00:00Z")});
  assert.equal(entries.length,1);assert.equal(entries[0].ref.key,ref.key);assert.equal(m.events.some(e=>e[0]==="remove"),false);
  m.repository.current=async()=>null;
  assert.equal((await cleanup.listAvatarCleanupCandidates({...m,now:new Date("2026-10-12T00:00:00Z")})).length,0);
});
