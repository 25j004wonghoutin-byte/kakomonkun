import test from "node:test";
import assert from "node:assert/strict";
import { createMeLoader, mergeMePoints, observeMeRefresh } from "../src/lib/me-client.ts";

const me = count => ({ id: "student", displayName: "あおい", role: "student", profile: { totalPoints: 2, avatarUrl: null, totalPracticeCount: 1, totalCorrectCount: 3, totalAnswerCount: 4, ownedTitleCount: count } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(fetchMe) {
  const received = [], errors = [], loading = [];
  return { received, errors, loading, loader: createMeLoader({ fetchMe, onData: value => received.push(value), onError: value => errors.push(value), onLoading: value => loading.push(value) }) };
}

test("latest started request wins", async () => {
  const a = deferred(), b = deferred(); let calls = 0;
  const { loader, received, loading } = setup(() => (++calls === 1 ? a.promise : b.promise));
  const first = loader.load(), second = loader.load();
  b.resolve(me(5)); await second; a.resolve(me(3)); await first;
  assert.equal(received.length, 1); assert.equal(received[0].profile.ownedTitleCount, 5);
  assert.equal(loading.at(-1), false);
});
test("dispose ignores late response", async () => {
  const d = deferred(); const { loader, received, errors, loading } = setup(() => d.promise);
  const request = loader.load(); loader.dispose(); const before = [received.length, errors.length, loading.length];
  d.resolve(me(4)); await request;
  assert.deepEqual([received.length, errors.length, loading.length], before);
});
test("failure clears stale data and retry recovers without exposing details", async () => {
  let calls = 0; const { loader, received, errors } = setup(async () => { if (++calls === 1) throw new Error("secret-db-password"); return me(4); });
  await loader.load(); assert.equal(received.at(-1), null); assert.ok(errors.at(-1)); assert.doesNotMatch(errors.at(-1), /secret/);
  await loader.load(); assert.equal(received.at(-1).profile.ownedTitleCount, 4); assert.equal(errors.at(-1), "");
});
test("daily points preserve owned count", () => {
  const original = me(4); const updated = mergeMePoints(original, 10);
  assert.equal(updated.profile.totalPoints, 10); assert.equal(updated.profile.ownedTitleCount, 4);
  assert.equal(original.profile.totalPoints, 2); assert.equal(mergeMePoints(null, 1), null);
});
test("pageshow and visible return refresh until cleanup", () => {
  const windowTarget = new EventTarget(), documentTarget = new EventTarget(); documentTarget.visibilityState = "hidden";
  let calls = 0; const remove = observeMeRefresh(() => { calls++; }, windowTarget, documentTarget);
  windowTarget.dispatchEvent(new Event("pageshow")); documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 1); documentTarget.visibilityState = "visible"; documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 2); remove(); windowTarget.dispatchEvent(new Event("pageshow")); assert.equal(calls, 2);
});
