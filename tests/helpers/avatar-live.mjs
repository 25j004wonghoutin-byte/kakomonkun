import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { loadTestConfig } from "../../scripts/test-environment.mjs";
import { openAvatarMaintenance } from "../../scripts/avatar-maintenance.mjs";

export async function createAvatarLiveFixture() {
  const config = loadTestConfig();
  const input = { ...config, SUPABASE_SECRET_KEY:config.TEST_SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY:config.TEST_SUPABASE_SERVICE_ROLE_KEY };
  if (!input.SUPABASE_SECRET_KEY && !input.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Dedicated test Storage secret is required for live avatar QA");
  const resources = await openAvatarMaintenance(input);
  const other = await openAvatarMaintenance(input);
  const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, input.SUPABASE_SECRET_KEY || input.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
  const runId = randomUUID();
  const actors = [], authIds = [], userIds = [];
  async function cleanup() {
    try {
      for await (const item of resources.storage.list()) {
        if (userIds.includes(item.key.split("/")[0])) await resources.storage.remove(item.key);
      }
      if (userIds.length) await resources.db.user.deleteMany({where:{id:{in:userIds}}});
      for (const id of authIds) {
        const result=await admin.auth.admin.deleteUser(id);
        assert.equal(!!result.error,false,"Delete only the created QA Auth user");
      }
    } finally { await Promise.all([resources.db.$disconnect(),other.db.$disconnect()]); }
  }
  try {
    for (const [index,role] of ["student","student","teacher"].entries()) {
      const email=`avatar-qa-${runId}-${index}@example.com`, password=randomBytes(24).toString("base64url");
      const result=await admin.auth.admin.createUser({email,password,email_confirm:true});
      assert.equal(!!result.error,false,"Create isolated confirmed test Auth user");
      authIds.push(result.data.user.id);
      const roleRow=await resources.db.role.findUniqueOrThrow({where:{name:role}});
      const user=await resources.db.user.create({data:{authUserId:result.data.user.id,email,displayName:`Avatar QA ${index}`,roleId:roleRow.id,
        ...(role==="student"?{studentProfile:{create:{bio:"アイコン検証"}}}:{teacherProfile:{create:{}}})}});
      userIds.push(user.id);
      const cookies=new Map();
      const auth=createServerClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>items.forEach(item=>cookies.set(item.name,item.value))},auth:{persistSession:true,autoRefreshToken:false}});
      const signed=await auth.auth.signInWithPassword({email,password});
      assert.equal(!!signed.error,false,"Sign in through the test Supabase Auth project");
      actors.push({...user,role,cookies,accessToken:signed.data.session.access_token});
    }
    const origin="http://127.0.0.1:3001";
    async function call(actor,path,init={}) {
      const headers=new Headers(init.headers);
      if(actor) headers.set("cookie",[...actor.cookies].map(([name,value])=>`${name}=${encodeURIComponent(value)}`).join("; "));
      if(["POST","DELETE","PATCH"].includes(init.method)) headers.set("origin",origin);
      return fetch(`${origin}${path}`,{...init,headers,signal:AbortSignal.timeout(30_000)});
    }
    return {...resources,other,admin,actors,config,call,cleanup};
  } catch(error) { await cleanup(); throw error; }
}
