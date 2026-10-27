import test from "node:test";
import assert from "node:assert/strict";
import { createReviewSessionGuard, readReviewIdentity } from "../src/lib/review-notebook/session-guard.ts";
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function setup() {
  const events = [], windowTarget = new EventTarget(), documentTarget = new EventTarget();
  documentTarget.visibilityState = "visible";
  let identity = "student-a";
  const guard = createReviewSessionGuard({ ownerId: identity, readIdentity: async () => identity,
    onInvalidate: () => events.push("clear"), onRestore: () => events.push("reload"), onMismatch: () => events.push("account-changed") });
  const stop = guard.observe(windowTarget, documentTarget);
  return { guard, events, windowTarget, documentTarget, stop, switchTo: value => { identity = value; } };
}
test("account switch rejects a delayed successful response before it can display private data", async () => {
  const h = setup(), response = deferred();
  const pending = h.guard.run(() => response.promise);
  h.switchTo("student-b"); response.resolve({ privateQuestion: "student-a" });
  await assert.rejects(pending, error => error.status === 401);
  assert.deepEqual(h.events, ["clear", "account-changed"]);
  h.stop();
});
test("hiding clears immediately and restoration discards old responses even when abort is ignored", async () => {
  const h = setup(), response = deferred();
  const pending = h.guard.run(() => response.promise);
  h.documentTarget.visibilityState = "hidden"; h.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.deepEqual(h.events, ["clear"]);
  h.documentTarget.visibilityState = "visible"; h.documentTarget.dispatchEvent(new Event("visibilitychange"));
  response.resolve({ privateQuestion: "old" });
  await assert.rejects(pending, error => error.name === "AbortError");
  assert.deepEqual(h.events, ["clear", "clear", "reload"]);
  assert.deepEqual(await h.guard.run(async () => ({ current: true })), { current: true });
  h.stop();
});
test("pageshow/focus revalidate after blur and disposed listeners never restore private state", async () => {
  const h = setup();
  h.windowTarget.dispatchEvent(new Event("blur"));
  h.windowTarget.dispatchEvent(new Event("focus"));
  h.windowTarget.dispatchEvent(new Event("pageshow"));
  assert.deepEqual(h.events, ["clear", "clear", "reload", "clear", "reload"]);
  h.stop(); const count = h.events.length;
  h.windowTarget.dispatchEvent(new Event("focus"));
  assert.equal(h.events.length, count);
  await assert.rejects(h.guard.run(async () => "private"), error => error.name === "AbortError");
});
test("logout or failed identity verification never releases a private response", async () => {
  const h = setup(); h.switchTo(null);
  await assert.rejects(h.guard.run(async () => "private"), error => error.status === 401);
  h.stop();
  const guard = createReviewSessionGuard({ ownerId: "a", readIdentity: async () => { throw Error("offline"); }, onInvalidate() {}, onRestore() {}, onMismatch() {} });
  await assert.rejects(guard.run(async () => "private"), /offline/);
  guard.dispose();
});
test("identity verification uses the actual me payload and denies non-student or unavailable sessions", async () => {
  const signal = new AbortController().signal;
  const reader = body => async (url, init) => { assert.equal(url, "/api/me"); assert.equal(init.cache, "no-store"); assert.equal(init.signal, signal); return Response.json(body); };
  assert.equal(await readReviewIdentity(signal, reader({ id: "student-a", role: "student" })), "student-a");
  assert.equal(await readReviewIdentity(signal, reader({ id: "teacher", role: "teacher" })), null);
  assert.equal(await readReviewIdentity(signal, async () => new Response(null, { status: 401 })), null);
  await assert.rejects(readReviewIdentity(signal, async () => new Response(null, { status: 500 })), /verification failed/);
});
test("effect cleanup and reattachment never revive an earlier request", async () => {
  const h = setup(), response = deferred();
  const old = h.guard.run(() => response.promise);
  h.stop(); const stopAgain = h.guard.observe(h.windowTarget, h.documentTarget);
  response.resolve("old private data");
  await assert.rejects(old, error => error.name === "AbortError");
  assert.equal(await h.guard.run(async () => "fresh"), "fresh");
  stopAgain();
});
