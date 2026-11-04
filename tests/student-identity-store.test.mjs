import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
async function store(fetcher) {
  const url = new URL("../src/lib/student-identity-store.ts", import.meta.url);
  assert.ok(existsSync(url), "identity memory must belong to the root provider");
  return (await import(url.href)).createStudentIdentityStore(fetcher);
}
const identity = { id: "student-1", displayName: "学生一", avatarUrl: null, titleName: "はじめの一歩" };
test("identity survives subscriber changes and deduplicates requests", async () => {
  let calls = 0, resolve;
  const memory = await store(() => { calls++; return new Promise(r => { resolve = r; }); });
  const off = memory.subscribe(() => {});
  const a = memory.load(), b = memory.load();
  resolve(identity); await Promise.all([a, b]);
  off();
  const nextOff = memory.subscribe(() => {});
  await memory.load();
  assert.equal(calls, 1);
  assert.deepEqual(memory.getSnapshot(), identity);
  nextOff();
});
test("an old request cannot overwrite profile edits or a new owner", async () => {
  let resolve;
  const memory = await store(() => new Promise(r => { resolve = r; }));
  const pending = memory.load();
  memory.remember({ ...identity, displayName: "変更後", titleName: "新しい称号" });
  resolve(identity); await pending;
  assert.equal(memory.getSnapshot().displayName, "変更後");
  memory.remember({ id: "student-2", displayName: "学生二", avatarUrl: null, titleName: null });
  assert.equal(memory.getSnapshot().titleName, null);
});
test("401 clears identity but transient errors keep the last display", async () => {
  let fail = false;
  const memory = await store(async () => { if (fail) throw new Error("network"); return identity; });
  await memory.load(); fail = true;
  await memory.load(true);
  assert.deepEqual(memory.getSnapshot(), identity);
  memory.clear();
  assert.equal(memory.getSnapshot(), null);
});

test("expired authentication cannot be repopulated by old server props", async () => {
  const memory = await store(async () => null);
  await memory.load();
  assert.equal(memory.isSignedOut(), true);
  memory.remember(identity);
  assert.equal(memory.getSnapshot(), null);
});
test("a new owner gets a fresh request after an older in-flight request finishes", async () => {
  const jobs = [];
  const memory = await store(() => new Promise(resolve => jobs.push(resolve)));
  const old = memory.load();
  memory.remember({ id: "student-2", displayName: "学生二", avatarUrl: null });
  jobs[0](identity); await old;
  assert.equal(jobs.length, 2);
  jobs[1]({ id: "student-2", displayName: "学生二", avatarUrl: null, titleName: "別の称号" });
  await memory.load();
  assert.equal(memory.getSnapshot().id, "student-2");
  assert.equal(memory.getSnapshot().titleName, "別の称号");
});

test("cached identity wins over same-owner prefetched props", async () => {
  const memory = await store(async () => identity);
  memory.remember({ ...identity, displayName: "変更後", titleName: "新しい称号" });
  memory.seed({ ...identity, displayName: "変更前", titleName: "古い称号" });
  assert.equal(memory.getSnapshot().displayName, "変更後");
  assert.equal(memory.getSnapshot().titleName, "新しい称号");
  memory.seed({ id: "student-2", displayName: "学生二", avatarUrl: null });
  assert.equal(memory.getSnapshot().id, "student-2");
  assert.equal(memory.getSnapshot().titleName, undefined);
});
test("a partial successful response does not trigger an automatic retry loop", async () => {
  let calls = 0;
  const memory = await store(async () => {
    if (++calls > 1) throw new Error("Unexpected retry");
    return { id: "student-1", displayName: "学生一", avatarUrl: null };
  });
  await memory.load(); await Promise.resolve();
  assert.equal(calls, 1);
});
