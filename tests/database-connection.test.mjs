import assert from "node:assert/strict";
import test from "node:test";
let configuration = {};
try { configuration = await import("../src/lib/database-connection.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const contextKey = Symbol.for("@vercel/request-context");

test("releasing a database connection keeps a Vercel request alive until idle cleanup", { timeout: 12000 }, async () => {
  assert.equal(typeof configuration.createDatabasePool,"function");
  const original = globalThis[contextKey];
  const oldUrl=process.env.VERCEL_URL, oldRegion=process.env.VERCEL_REGION;
  const jobs=[];
  globalThis[contextKey]={get:()=>({waitUntil:promise=>jobs.push(promise)})};
  process.env.VERCEL_URL="qa.example.test";process.env.VERCEL_REGION="icn1";
  const pool=configuration.createDatabasePool("postgresql://unused:unused@localhost:5432/unused",{KAKOMON_DATABASE_POOL_MAX:"3"});
  try {
    assert.equal(pool.totalCount,0);
    assert.equal(pool.options.max,3);
    assert.equal(pool.options.idleTimeoutMillis,5000);
    pool.emit("release",null,{});
    assert.equal(jobs.length,1,"release must register background cleanup with Vercel");
    let finished=false;jobs[0].then(()=>{finished=true;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(finished,false,"the request cannot suspend immediately after release");
    await Promise.all(jobs);
  } finally {
    await pool.end();
    if(original===undefined)delete globalThis[contextKey];else globalThis[contextKey]=original;
    for(const [key,value] of [["VERCEL_URL",oldUrl],["VERCEL_REGION",oldRegion]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
