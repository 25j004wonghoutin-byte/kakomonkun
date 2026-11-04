import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
async function session(fetcher) {
  const url = new URL("../src/lib/student-identity-session.ts", import.meta.url);
  assert.ok(existsSync(url), "page-owned and sidebar identity requests must share one root session");
  return (await import(url.href)).createStudentIdentitySession(fetcher);
}
const me = { id: "student-1", displayName: "現在の学生", role: "student", profile: { avatarUrl: null, currentTitleName: "現在の称号" } };
test("page and sidebar share one request with independently readable response bodies", async () => {
  let calls = 0, release;
  const s = await session(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  const identity = s.store.load(), page = s.requestMe();
  release(Response.json(me));
  const [saved, response] = await Promise.all([identity, page]);
  assert.equal(calls, 1);
  assert.equal(saved.titleName, "現在の称号");
  assert.deepEqual(await response.json(), me);
});
test("a page-owned401 clears remembered identity without a focus refresh", async () => {
  const s = await session(async () => Response.json({ error: "login" }, { status: 401 }));
  s.store.remember({ id: "student-1", displayName: "前の学生", avatarUrl: null, titleName: "前の称号" });
  assert.equal((await s.requestMe()).status, 401);
  assert.equal(s.store.getSnapshot(), null);
  assert.equal(s.store.isSignedOut(), true);
});

test("an old unauthorized response cannot clear a newly supplied owner", async () => {
  let release;
  const s = await session(() => new Promise(resolve => { release = resolve; }));
  s.store.remember({ id: "student-1", displayName: "one", avatarUrl: null, titleName: null });
  const old = s.requestMe();
  s.store.remember({ id: "student-2", displayName: "two", avatarUrl: null, titleName: null });
  release(Response.json({ error: "old login" }, { status: 401 })); await old;
  assert.equal(s.store.getSnapshot()?.id, "student-2");
});
test("in-flight response sharing is bound to the current owner", async () => {
  const jobs = [];
  const s = await session(() => new Promise(resolve => jobs.push(resolve)));
  s.store.remember({ id: "student-1", displayName: "one", avatarUrl: null, titleName: null });
  const old = s.requestMe();
  s.store.remember({ id: "student-2", displayName: "two", avatarUrl: null, titleName: null });
  const next = s.requestMe();
  assert.equal(jobs.length, 2);
  jobs[0](Response.json(me)); jobs[1](Response.json({ ...me, id: "student-2" }));
  assert.equal((await (await old).json()).id, "student-1");
  assert.equal((await (await next).json()).id, "student-2");
});
