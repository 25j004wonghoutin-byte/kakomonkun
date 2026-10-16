import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { createAvatarLiveFixture } from "./helpers/avatar-live.mjs";
import { createAvatarRef } from "../src/lib/avatars/contract.ts";
import { createAvatarService } from "../src/lib/avatars/service.ts";

test("private avatar storage, real Auth, permissions and concurrent database updates",{skip:process.env.KAKOMON_RUN_AVATAR_QA!=="1",timeout:180_000},async t=>{
  const fixture=await createAvatarLiveFixture();
  const {db,other,storage,repository,actors:[a,b,teacher],config,call}=fixture;
  const image=await sharp({create:{width:512,height:512,channels:4,background:"#5577ee80"}}).webp().toBuffer();
  let current;
  const form=(expected,extra=false)=>{const data=new FormData();data.set("image",new Blob([image],{type:"image/webp"}),"crop.webp");data.set("expectedAvatarUrl",JSON.stringify(expected));if(extra)data.set("userId",a.id);return data;};
  try {
    await t.test("real Supabase sessions save and expose current images only to active students and teachers",async()=>{
      const beforeResponse=await call(a,"/api/me");assert.equal(beforeResponse.status,200);const before=await beforeResponse.json();
      const saved=await call(a,"/api/profile/avatar",{method:"POST",body:form(null)});assert.equal(saved.status,200);current=(await saved.json()).avatarUrl;
      assert.ok(current.startsWith(`/api/avatars/${a.id}/`));
      for(const actor of [a,b,teacher]){
        const response=await call(actor,current);assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store, max-age=0");
        const meta=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.hasAlpha,true);
      }
      const after=await (await call(a,"/api/me")).json();
      assert.deepEqual({...after.profile,avatarUrl:before.profile.avatarUrl},before.profile);
      for(const method of ["GET","HEAD"])assert.equal((await call(null,current,{method,headers:{range:"bytes=0-1","if-none-match":"etag"}})).status,401);
      assert.equal((await call(teacher,"/api/profile/avatar",{method:"POST",body:form(null)})).status,403);
      assert.equal((await call(b,"/api/profile/avatar",{method:"POST",body:form(null,true)})).status,400);
      assert.equal((await call(b,"/api/profile/avatar",{method:"POST",body:form(current)})).status,409);
      assert.equal((await repository.current(a.id)).avatarUrl,current);
    });
    await t.test("normal JWT and anonymous Storage access remain denied despite an extra permissive policy",async()=>{
      assert.ok(current,"The preceding real API upload must succeed before testing its object policy");
      const key=current.replace(`/api/avatars/${a.id}/`,`${a.id}/`)+".webp";
      const permissive=`avatar_qa_${randomUUID().replaceAll("-","")}`;
      await db.$executeRawUnsafe(`CREATE POLICY ${permissive} ON storage.objects AS PERMISSIVE FOR ALL TO anon, authenticated USING (bucket_id = 'student-avatars') WITH CHECK (bucket_id = 'student-avatars')`);
      try {
        for(const token of [null,b.accessToken]){
          const client=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:token?{headers:{Authorization:`Bearer ${token}`}}:{}});
          const bucket=client.storage.from("student-avatars");
          assert.ok((await bucket.download(key)).error);
          const list=await bucket.list(a.id);assert.equal(list.data?.length??0,0);
          assert.ok((await bucket.upload(`${b.id}/${randomUUID()}.webp`,image,{contentType:"image/webp"})).error);
          assert.ok((await bucket.createSignedUrl(key,60)).error);
          await bucket.remove([key]);assert.ok(await storage.get(key));
          const publicResponse=await fetch(bucket.getPublicUrl(key).data.publicUrl);assert.notEqual(publicResponse.status,200);
        }
      } finally { await db.$executeRawUnsafe(`DROP POLICY ${permissive} ON storage.objects`); }
    });
    await t.test("inactive users, stale versions and replacement/deletion are enforced against real data",async()=>{
      await db.user.update({where:{id:b.id},data:{status:"inactive"}});
      assert.equal((await call(b,current)).status,401);
      await db.user.update({where:{id:b.id},data:{status:"active"}});
      const old=current;
      const replaced=await call(a,"/api/profile/avatar",{method:"POST",body:form(old)});assert.equal(replaced.status,200);current=(await replaced.json()).avatarUrl;
      assert.notEqual(current,old);assert.equal((await call(b,old)).status,404);
      assert.equal((await call(a,"/api/profile/avatar",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({expectedAvatarUrl:old})})).status,409);
      const removed=await call(a,"/api/profile/avatar",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({expectedAvatarUrl:current})});assert.equal(removed.status,200);
      assert.equal((await repository.current(a.id)).avatarUrl,null);assert.equal((await call(b,current)).status,404);
      const missing=createAvatarRef(a.id,randomUUID());await db.studentProfile.update({where:{userId:a.id},data:{avatarUrl:missing.url}});
      try{assert.equal((await call(b,missing.url)).status,404,"A missing current Storage object is a 404, not an internal failure");}finally{await db.studentProfile.update({where:{userId:a.id},data:{avatarUrl:null}});}
    });
    await t.test("independent Prisma transactions keep one winner under save/save and save/delete contention",async()=>{
      const {createAvatarRepository}=await import("../src/lib/avatars/repository.ts");
      const makeService=(repo)=>createAvatarService({repository:repo,storage,newVersion:randomUUID,log:()=>{}});
      const serviceA=makeService(repository),serviceB=makeService(createAvatarRepository(other.db));
      const writes=await Promise.allSettled([serviceA.save({userId:a.id,expectedAvatarUrl:null,image}),serviceB.save({userId:a.id,expectedAvatarUrl:null,image})]);
      assert.equal(writes.filter(v=>v.status==="fulfilled").length,1);assert.equal(writes.find(v=>v.status==="rejected").reason.status,409);
      const winner=(await repository.current(a.id)).avatarUrl;const ref=winner.split("/");assert.ok(await storage.get(`${a.id}/${ref.at(-1)}.webp`));
      const changes=await Promise.allSettled([serviceA.save({userId:a.id,expectedAvatarUrl:winner,image}),serviceB.remove({userId:a.id,expectedAvatarUrl:winner})]);
      assert.equal(changes.filter(v=>v.status==="fulfilled").length,1);assert.equal(changes.find(v=>v.status==="rejected").reason.status,409);
      const final=(await repository.current(a.id)).avatarUrl;if(final)assert.ok(await storage.get(`${a.id}/${final.split("/").at(-1)}.webp`));
    });
    await t.test("a cleanup ownership check waits for an in-flight profile commit",async()=>{
      const ref=createAvatarRef(a.id,randomUUID());await storage.put(ref.key,image);
      let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
      const held=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${a.id}::uuid FOR UPDATE`;await tx.studentProfile.update({where:{userId:a.id},data:{avatarUrl:ref.url}});enter();await gate;},{timeout:15_000});
      await entered;
      const {createAvatarRepository}=await import("../src/lib/avatars/repository.ts");
      let settled=false;const check=createAvatarRepository(other.db).unreferencedAfterLock(ref).then(result=>{settled=true;return result;});
      try {
        let blocked=false;
        const observer=await openObserver(config);
        try {for(let i=0;i<50;i++){const rows=await observer.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%public.users%'`;if(rows[0].count>0){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}}finally{await observer.$disconnect();}
        assert.equal(blocked,true);assert.equal(settled,false);
      } finally {release();await held;}
      assert.equal(await check,false);assert.ok(await storage.get(ref.key));
    });
  } finally {await fixture.cleanup();}
});

async function openObserver(config){
  const {openAvatarMaintenance}=await import("../scripts/avatar-maintenance.mjs");
  return (await openAvatarMaintenance({...config,SUPABASE_SECRET_KEY:config.TEST_SUPABASE_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY:config.TEST_SUPABASE_SERVICE_ROLE_KEY})).db;
}
