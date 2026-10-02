import assert from "node:assert/strict";
import test from "node:test";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";
let activity = {};
try { activity = await import("../src/lib/titles/activity.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const now = new Date("2026-10-02T10:00:00Z");
const initial = () => ({ lastSequence: 0, stage: "idle", roundTrips: 0 });
function advance(state, sequence, path) { assert.equal(typeof activity.advanceNavigation, "function"); return activity.advanceNavigation(state, { sequence, path }); }
function record(db, at = now, extra = {}) { assert.equal(typeof activity.recordTitleActivity, "function"); return db.prisma.$transaction((tx) => activity.recordTitleActivity(tx, "student", { now: at, ...extra })); }
const day = (date, hasAnswered = false) => ({ userId: "student", activityDate: new Date(`${date}T00:00:00Z`), hasAnswered, firstSeenAt: new Date(`${date}T00:00:00Z`), lastSeenAt: new Date(`${date}T00:00:00Z`) });
const unlocked = (db, key) => db.state.unlocks.some((row) => row.titleId === key);

test("five home-profile-home trips count exactly five", () => {
  let state = initial(), sequence = 0;
  for (const path of ["/", ...Array.from({ length: 5 }, () => ["/profile", "/"]).flat()]) state = advance(state, ++sequence, path);
  assert.equal(state.roundTrips, 5);
});
test("reload, StrictMode retry and out-of-order sequence do not inflate trips", () => {
  let state = advance(initial(), 1, "/"); state = advance(state, 2, "/profile"); state = advance(state, 3, "/profile");
  state = advance(state, 3, "/"); state = advance(state, 2, "/");
  assert.equal(state.roundTrips, 0); assert.equal(advance(state, 4, "/").roundTrips, 1);
});
test("another screen or an unobserved sequence breaks partial trip", () => {
  let state = advance(initial(), 1, "/"); state = advance(state, 2, "/profile"); state = advance(state, 3, "/board"); state = advance(state, 4, "/");
  assert.equal(state.roundTrips, 0);
  state = advance(state, 5, "/profile"); assert.equal(advance(state, 7, "/").roundTrips, 0);
});
test("trips from distinct tabs cannot be combined into partial trips", async () => {
  const db = makeLearningMemory();
  await record(db, now, { navigation: { tabId: "A", sequence: 1, path: "/" } });
  await record(db, now, { navigation: { tabId: "B", sequence: 1, path: "/profile" } });
  await record(db, now, { navigation: { tabId: "A", sequence: 2, path: "/" } });
  assert.equal(db.state.navigation.reduce((sum, row) => sum + row.roundTrips, 0), 0);
  await record(db, now, { navigation: { tabId: "A", sequence: 3, path: "/profile" } });
  await record(db, now, { navigation: { tabId: "A", sequence: 4, path: "/" } });
  assert.equal(db.state.navigation[0].roundTrips, 1);
});
test("same-day use is one row and a later visit cannot clear answered flag", async () => {
  const db = makeLearningMemory(); await record(db, now, { hasAnswered: true }); await record(db);
  assert.equal(db.state.activities.length, 1); assert.equal(db.state.activities[0].hasAnswered, true);
});
test("five unanswered usage days unlock only once they are closed", async () => {
  const tracking = new Date("2026-09-26T03:00:00Z");
  const db = makeLearningMemory({ profile: { titleTrackingStartedAt: tracking, titleBackfilledAt: null }, activities: ["27", "28", "29", "30"].map((date) => day(`2026-09-${date}`)) });
  await record(db, new Date("2026-10-01T14:59:00Z")); assert.equal(unlocked(db, "v1-017"), false);
  await record(db, new Date("2026-10-01T15:00:00Z")); assert.equal(unlocked(db, "v1-017"), true);
});
test("late answer on the fifth day prevents unanswered eligibility", async () => {
  const db = makeLearningMemory({ profile: { titleTrackingStartedAt: new Date("2026-09-26T03:00:00Z"), titleBackfilledAt: null }, activities: ["27", "28", "29", "30"].map((date) => day(`2026-09-${date}`)) });
  await record(db, new Date("2026-10-01T14:58:00Z")); await record(db, new Date("2026-10-01T14:59:00Z"), { hasAnswered: true }); await record(db, new Date("2026-10-01T15:00:00Z"));
  assert.equal(unlocked(db, "v1-017"), false);
});
for (const [gap, want] of [[13, false], [14, true]]) test(`observed return gap of ${gap} days eligibility=${want}`, async () => {
  const before = new Date(+now - gap * 86400000);
  const db = makeLearningMemory({ profile: { titleTrackingStartedAt: before, titleBackfilledAt: null }, activities: [day(before.toISOString().slice(0, 10))] });
  await record(db); assert.equal(unlocked(db, "v1-036"), want);
});
test("unknown history and the initial partially observed day do not count as absence", async () => {
  const db = makeLearningMemory({ activities: [day("2020-01-01")] }); await record(db);
  assert.equal(unlocked(db, "v1-036"), false); assert.equal(unlocked(db, "v1-017"), false);
});
test("three answered usage days then one absent day unlock on return", async () => {
  const db = makeLearningMemory({ profile: { titleTrackingStartedAt: new Date("2026-09-27T00:00:00Z"), titleBackfilledAt: null }, activities: ["28", "29", "30"].map((date) => day(`2026-09-${date}`, true)) });
  await record(db); assert.equal(unlocked(db, "v1-020"), true);
});
test("365 actual consecutive usage days unlock attendance", async () => {
  const activities = Array.from({ length: 364 }, (_, i) => day(new Date(+now - (364 - i) * 86400000).toISOString().slice(0, 10)));
  const db = makeLearningMemory({ profile: { titleTrackingStartedAt: activities[0].firstSeenAt, titleBackfilledAt: null }, activities });
  await record(db); assert.equal(unlocked(db, "v1-066"), true);
});
test("teacher activity does not create student history or titles", async () => {
  const db = makeLearningMemory({ user: { id: "student", role: { name: "teacher" }, status: "active", deletedAt: null } }); await record(db);
  assert.equal(db.state.activities.length, 0); assert.equal(db.state.unlocks.length, 0);
});
