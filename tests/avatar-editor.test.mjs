import assert from "node:assert/strict";
import test from "node:test";
let editor = {};
try { editor = await import("../src/app/profile/avatar-editor-state.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
const prepared = () => { const p={width:512,height:512,source:{},disposed:0,dispose(){p.disposed++;}};return p; };
const nextUrl="/api/avatars/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
function setup(extra={}) {
  assert.equal(typeof editor.createAvatarEditorController,"function");
  const requests=[],saved=[];let closed=0;
  const c=editor.createAvatarEditorController({currentAvatarUrl:"https://legacy.example/a.png",onSaved:v=>saved.push(v),onClose:()=>closed++,prepareSource:async()=>prepared(),encodeCrop:async()=>new Blob(["crop"],{type:"image/webp"}),fetcher:async(url,init)=>{requests.push([url,init]);return Response.json({avatarUrl:nextUrl});},...extra});
  return {c,requests,saved,get closed(){return closed;}};
}
test("cancelling the avatar editor never sends an image and releases prepared input",async()=>{
  const p=prepared();const m=setup({prepareSource:async()=>p});await m.c.choose(new File(["x"],"x.png"));m.c.close();
  assert.equal(m.requests.length,0);assert.equal(p.disposed,1);assert.equal(m.closed,1);
});
test("avatar save sends one cropped WebP with raw expectation even on double click",async()=>{
  let release;const gate=new Promise(r=>release=r);const requests=[];
  const m=setup({fetcher:async(url,init)=>{requests.push([url,init]);await gate;return Response.json({avatarUrl:nextUrl});}});
  await m.c.choose(new File(["x"],"x.png"));const first=m.c.save();await m.c.save();
  await Promise.resolve();release();await first;
  assert.equal(requests.length,1);assert.equal(requests[0][1].body.get("expectedAvatarUrl"),'"https://legacy.example/a.png"');
  assert.equal(requests[0][1].body.get("image").type,"image/webp");assert.deepEqual(m.saved,[nextUrl]);assert.equal(m.closed,1);
});
test("a late decoded avatar source cannot replace a newer selection and is disposed",async()=>{
  let release;const p1=prepared(),p2=prepared();const m=setup({prepareSource:async file=>file.name==="a.png"?new Promise(r=>release=r):p2});
  const first=m.c.choose(new File(["a"],"a.png"));await m.c.choose(new File(["b"],"b.png"));release(p1);await first;
  assert.equal(m.c.getSnapshot().source,p2);assert.equal(p1.disposed,1);m.c.dispose();assert.equal(p2.disposed,1);
});
test("unknown avatar save plus failed refresh does not report success or permit a blind retry",async()=>{
  let calls=0;const m=setup({fetcher:async()=>{calls++;throw new Error("offline");}});
  await m.c.choose(new File(["a"],"a.png"));await m.c.save();await m.c.save();
  assert.equal(calls,2);assert.equal(m.saved.length,0);assert.equal(m.c.getSnapshot().needsRefresh,true);
  assert.equal(m.c.getSnapshot().busy,false);m.c.close();assert.equal(m.closed,1);
});
test("conflict refresh updates the expectation without automatically resending the crop",async()=>{
  const calls=[];const m=setup({fetcher:async(url,init)=>{calls.push([url,init]);return url==="/api/me"?Response.json({profile:{avatarUrl:nextUrl}}):Response.json({error:"conflict"},{status:409});}});
  await m.c.choose(new File(["a"],"a.png"));await m.c.save();
  assert.equal(calls.length,2);assert.equal(calls[1][1].cache,"no-store");
  assert.equal(m.c.getSnapshot().expectedAvatarUrl,nextUrl);assert.equal(m.c.getSnapshot().needsRefresh,false);assert.equal(m.closed,0);
});
test("avatar deletion requires confirmation and a pending operation cannot be closed",async()=>{
  let release;const gate=new Promise(r=>release=r);const m=setup({fetcher:async()=>{await gate;return Response.json({avatarUrl:null});}});
  await m.c.confirmDelete();assert.equal(m.saved.length,0);
  m.c.requestDelete();const done=m.c.confirmDelete();m.c.close();assert.equal(m.closed,0);release();await done;
  assert.deepEqual(m.saved,[null]);assert.equal(m.closed,1);
});
