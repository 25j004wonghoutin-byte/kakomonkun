import assert from "node:assert/strict";
import {createHash,createHmac,randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import test from "node:test";

const config={secret:"test-only-ephemeral-signing-key-0123456789",projectRef:"grzylombpqmidltnbwhx",environment:"test"};
const now=new Date("2050-01-20T00:00:00Z"),body='{"action":"tick"}';
function signed({time=Math.floor(+now/1000),nonce=randomUUID(),secret=config.secret,project=config.projectRef,environment=config.environment,...overrides}={}){
  const canonical=`POST\n/api/internal/mock-exams/tick\n${project}\n${environment}\n${time}\n${nonce}\n${createHash("sha256").update(body).digest("hex")}`;
  return new Request(overrides.url??"https://app.example/api/internal/mock-exams/tick",{method:overrides.method??"POST",headers:{"content-type":"application/json","x-mock-time":String(time),"x-mock-nonce":nonce,"x-mock-project":project,"x-mock-environment":environment,"x-mock-signature":createHmac("sha256",secret).update(canonical).digest("hex"),...overrides.headers},...((overrides.method??"POST")==="GET"?{}:{body:overrides.body??body})});
}
async function module(){const path=new URL("../src/lib/mock-exams/job-auth.ts",import.meta.url);assert.ok(existsSync(path),"short-lived signed job authentication must exist");return import(path.href);}

test("signed job accepts exact canonical payload only within inclusive sixty-second skew",async()=>{
  const {verifyMockJobRequest:verify}=await module();
  for(const seconds of [-60,0,60]){const nonce=randomUUID();assert.deepEqual(await verify(signed({time:Math.floor(+now/1000)+seconds,nonce}),config,now),{nonce});}
  for(const seconds of [-61,61])await assert.rejects(verify(signed({time:Math.floor(+now/1000)+seconds}),config,now),error=>error.status===401);
});

test("method path raw body project environment key and malformed headers cannot be changed",async()=>{
  const {verifyMockJobRequest:verify}=await module();
  for(const change of [
    {method:"GET"},{url:"https://app.example/api/internal/mock-exams/other"},{url:"https://app.example/api/internal/mock-exams/tick?x=1"},
    {body:'{"action":"other"}'},{body:'{ "action": "tick" }'},{body:"x".repeat(2000)},
    {project:"ckgoikdjhtklhbzdgxxs"},{environment:"production"},{secret:"different-key-01234567890123456789"},
    {headers:{"x-mock-time":"NaN"}},{headers:{"x-mock-time":"1e12"}},{headers:{"x-mock-nonce":"not-a-nonce"}},{headers:{"x-mock-signature":"bad"}},
  ])await assert.rejects(verify(signed(change),config,now),error=>error.status===401);
  await assert.rejects(verify(new Request("https://app.example/api/internal/mock-exams/tick",{method:"POST",headers:{cookie:"logged-in-teacher"},body}),config,now),error=>error.status===401);
  for(const bad of [{...config,secret:"short"},{...config,environment:"production"},{...config,projectRef:"unknown"}])await assert.rejects(verify(signed(),bad,now),error=>error.status===503);
  const prod={secret:"separate-production-fixture-key-0123456789",projectRef:"ckgoikdjhtklhbzdgxxs",environment:"production"};
  assert.ok((await verify(signed({secret:prod.secret,project:prod.projectRef,environment:prod.environment}),prod,now)).nonce);
  await assert.rejects(verify(signed(),prod,now),error=>error.status===401);
});
