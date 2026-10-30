import test from "node:test";
import assert from "node:assert/strict";

let saves = {}, dates = {};
try { saves = await import("../src/lib/pending-practice-saves.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
dates = await import("../src/lib/tokyo-date.ts");
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test("the next practice list read waits for a pending answer save", async () => {
  assert.equal(typeof saves.trackPracticeSave, "function");
  const gate = deferred();
  const operation = saves.trackPracticeSave(() => gate.promise);
  let listRead = false;
  const reading = saves.waitForPracticeSaves().then(() => { listRead = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(listRead, false);
  gate.resolve({ selectedChoiceId: "a" });
  assert.deepEqual(await operation, { selectedChoiceId: "a" });
  await reading;
  assert.equal(listRead, true);
});
test("failed saves release the next list read without hiding the failure", async () => {
  assert.equal(typeof saves.trackPracticeSave, "function");
  const gate = deferred();
  const operation = saves.trackPracticeSave(() => gate.promise);
  const rejected = assert.rejects(operation, /save failed/);
  const reading = saves.waitForPracticeSaves();
  gate.reject(new Error("save failed"));
  await rejected;
  await reading;
  await saves.waitForPracticeSaves();
});
test("another save started while the list waits is included", async () => {
  assert.equal(typeof saves.trackPracticeSave, "function");
  const first = deferred(), second = deferred();
  const one = saves.trackPracticeSave(() => first.promise);
  let ready = false;
  const reading = saves.waitForPracticeSaves().then(() => { ready = true; });
  const two = saves.trackPracticeSave(() => second.promise);
  first.resolve(1); await one;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ready, false);
  second.resolve(2); await two; await reading;
  assert.equal(ready, true);
});
test("synchronous save failures do not leave a pending operation", async () => {
  assert.equal(typeof saves.trackPracticeSave, "function");
  await assert.rejects(saves.trackPracticeSave(() => { throw new Error("sync failure"); }), /sync failure/);
  await saves.waitForPracticeSaves();
});
test("learning time is Japanese time regardless of the host time zone", () => {
  assert.equal(typeof dates.formatTokyoDateTime, "function");
  const previous = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      assert.equal(dates.formatTokyoDateTime("2026-10-29T02:25:02.820Z"), "10/29 11:25");
      assert.equal(dates.formatTokyoDateTime(new Date("2026-12-31T15:05:00.000Z")), "1/1 00:05");
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
