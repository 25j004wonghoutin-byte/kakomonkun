import assert from "node:assert/strict";
import test from "node:test";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";
import { recordTitleActivity } from "../src/lib/titles/activity.ts";

const now = new Date("2026-10-02T10:00:00Z");
const day = date => ({ userId: "student", activityDate: new Date(`${date}T00:00:00Z`), hasAnswered: false, firstSeenAt: new Date(`${date}T00:00:00Z`), lastSeenAt: new Date(`${date}T00:00:00Z`) });

async function recordAndCount(db, input = {}) {
  const calls = {};
  await db.prisma.$transaction(async tx => {
    for (const [model, method] of [["dailyQaAnswer", "findMany"], ["randomQuizAttempt", "findMany"], ["practiceAnswer", "findMany"], ["practiceSession", "findMany"], ["boardPost", "count"], ["boardComment", "count"], ["studentActivityDay", "findMany"], ["studentNavigationProgress", "findMany"], ["userTitleUnlock", "findMany"]]) {
      const original = tx[model][method];
      tx[model][method] = (...args) => { calls[model] = (calls[model] ?? 0) + 1; return original(...args); };
    }
    const originalRaw = tx.$queryRaw;
    tx.$queryRaw = (...args) => { const key=args[0].sql?.includes("title-history")?"historyReads":"ownerLocks";calls[key]=(calls[key]??0)+1;return originalRaw(...args); };
    const originalUser = tx.user.findUnique;
    tx.user.findUnique = (...args) => { calls.userReads = (calls.userReads ?? 0) + 1; return originalUser(...args); };
    await recordTitleActivity(tx, "student", { now, ...input });
  });
  return calls;
}

test("activity reads stable learning history once while rechecking changed days and navigation", async () => {
  const db = makeLearningMemory();
  const calls = await recordAndCount(db);
  assert.equal(calls.historyReads,1);
  for (const model of ["dailyQaAnswer", "randomQuizAttempt", "practiceAnswer", "practiceSession", "boardPost", "boardComment"]) assert.equal(calls[model], undefined, model);
  assert.equal(calls.studentActivityDay, 2);
  assert.equal(calls.studentNavigationProgress, 2);
});

test("pre-save return eligibility survives the activity update", async () => {
  const before = new Date(+now - 14 * 86400000);
  const db = makeLearningMemory({ profile: { titleTrackingStartedAt: before, titleBackfilledAt: null }, activities: [day(before.toISOString().slice(0, 10))] });
  await recordAndCount(db);
  assert.ok(db.state.unlocks.some(row => row.titleId === "v1-036"));
  assert.equal(db.state.activities.length, 2);
});

test("stable history is discarded between activity transactions", async () => {
  const daily = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].map(date => ({ userId: "student", questionId: "q", answerDate: new Date(date), answeredAt: new Date(date), isCorrect: false, question: { category: { code: "technology" } } }));
  const db = makeLearningMemory({ daily });
  await recordAndCount(db);
  assert.equal(db.state.unlocks.some(row => row.titleId === "v1-038"), false);
  db.state.daily.push({ userId: "student", questionId: "q", answerDate: new Date("2026-10-02"), answeredAt: now, isCorrect: false, question: db.state.questions[0] });
  const calls = await recordAndCount(db, { hasAnswered: true });
  assert.equal(calls.historyReads, 1);
  assert.ok(db.state.unlocks.some(row => row.titleId === "v1-038"));
  assert.equal(db.state.activities[0].hasAnswered, true);
});

test("post-save navigation eligibility sees the fifth completed round trip", async () => {
  const db = makeLearningMemory({ navigation: [{ userId: "student", tabId: "A", lastSequence: 10, stage: "profile", roundTrips: 4 }] });
  await recordAndCount(db, { navigation: { tabId: "A", sequence: 11, path: "/" } });
  assert.ok(db.state.unlocks.some(row => row.titleId === "v1-037"));
  assert.equal(db.state.navigation[0].roundTrips, 5);
});

test("activity keeps the owner lock while verifying the active student only once", async () => {
  const calls = await recordAndCount(makeLearningMemory());
  assert.equal(calls.ownerLocks, 2);
  assert.equal(calls.userReads, 1);
});

test("inactive students and teachers do not start the history reader", async () => {
  for (const override of [{ status: "suspended" }, { deletedAt: now }, { role: { name: "teacher" } }]) {
    const db = makeLearningMemory({ user: { id: "student", role: { name: "student" }, status: "active", deletedAt: null, ...override } });
    const calls = await recordAndCount(db);
    assert.equal(calls.dailyQaAnswer, undefined);
    assert.equal(db.state.activities.length, 0);
    assert.equal(db.state.unlocks.length, 0);
  }
});
test("a missing profile does not start cached history reads or activity writes", async () => {
  const db = makeLearningMemory({ profile: null });
  const calls = await recordAndCount(db);
  assert.equal(calls.dailyQaAnswer, undefined);
  assert.equal(db.state.activities.length, 0);
  assert.equal(db.state.unlocks.length, 0);
});

test("pre and post activity eligibility share one unlock persistence read", async () => {
 const db=makeLearningMemory({sessions:[{id:"session",userId:"student",status:"completed",questionCount:60,answeredCount:60,correctCount:0,completedAt:now}]});
 const calls=await recordAndCount(db);assert.equal(calls.userTitleUnlock,1,"the same transaction should not reread unlock storage for both evaluations");assert.ok(db.state.unlocks.length>0);
});
