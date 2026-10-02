import assert from "node:assert/strict";
import test from "node:test";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";
let service = {};
try { service = await import("../src/lib/titles/learning-events.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const now = new Date("2026-10-02T10:00:00Z");
const student = { id: "student", isStudent: true };
const session = (overrides = {}) => ({ id: "session", userId: "student", status: "in_progress", questionCount: 30, answeredCount: 29, correctCount: 29, earnedPoints: 0, completedAt: null, ...overrides });
const database = (overrides = {}) => makeLearningMemory({ sessions: [session()], sessionQuestions: [{ sessionId: "session", questionId: "q", orderNo: 30 }], ...overrides });
const answer = (db, user = student) => { assert.equal(typeof service.savePracticeAnswer, "function"); return db.prisma.$transaction((tx) => service.savePracticeAnswer(tx, user, "session", { questionId: "q", selectedChoiceId: "correct" }, now)); };
const finish = (db, user = student) => { assert.equal(typeof service.finishPracticeSession, "function"); return db.prisma.$transaction((tx) => service.finishPracticeSession(tx, user, "session", now)); };

test("practice answer updates saved counts and title activity atomically", async () => {
  const db = database(); const result = await answer(db);
  assert.equal(result.isCorrect, true); assert.equal(db.state.sessions[0].answeredCount, 30);
  assert.equal(db.state.practiceAnswers.length, 1); assert.equal(db.state.activities[0].hasAnswered, true);
  assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-008"), false); // Completion titles only after finish.
});
test("practice duplicate answer preserves the existing conflict contract", async () => {
  const db = database(); await answer(db); await assert.rejects(answer(db), (error) => error.status === 409);
  assert.equal(db.state.practiceAnswers.length, 1); assert.equal(db.state.sessions[0].answeredCount, 30);
});
test("answer before finish includes the final answer and rewards it once", async () => {
  const db = database(); const [, result] = await Promise.all([answer(db), finish(db)]);
  assert.equal(result.answeredAllQuestions, true); assert.equal(result.earnedPoints, 8);
  assert.equal(db.state.profile.totalPoints, 8); assert.equal(db.state.points.length, 2);
});
test("finish before answer prevents answers after completion", async () => {
  const db = database(); const results = await Promise.allSettled([finish(db), answer(db)]);
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].reason.status, 409);
  assert.equal(db.state.practiceAnswers.length, 0); assert.equal(db.state.profile.totalPoints, 0);
});
test("repeated finish does not repeat points, counters or unlock notifications", async () => {
  const db = database({ sessions: [session({ answeredCount: 30, correctCount: 30 })] });
  await finish(db); const snapshot = structuredClone(db.state); const result = await finish(db);
  assert.equal(result.alreadyCompleted, true); assert.equal(db.state.profile.totalPracticeCount, 1);
  assert.equal(db.state.points.length, snapshot.points.length); assert.equal(db.state.notifications.length, snapshot.notifications.length);
});
test("daily practice completion limit remains two but correct bonus still applies", async () => {
  const db = database({ sessions: [session({ answeredCount: 30, correctCount: 30 })], points: [1, 2].map(() => ({ userId: "student", reason: "practice_complete", transactionDate: new Date("2026-10-02T00:00:00Z") })) });
  const result = await finish(db); assert.equal(result.completionPoints, 0); assert.equal(result.correctBonusPoints, 3); assert.equal(result.earnedPoints, 3);
});
test("teachers can answer and finish without title, activity or point writes", async () => {
  const db = database({ user: { id: "student", role: { name: "teacher" }, status: "active", deletedAt: null } });
  const teacher = { id: "student", isStudent: false }; await answer(db, teacher); await finish(db, teacher);
  assert.equal(db.state.activities.length, 0); assert.equal(db.state.unlocks.length, 0); assert.equal(db.state.points.length, 0); assert.equal(db.state.profile.totalPracticeCount, 0);
});
test("pausing preserves ended perfect history while early finish breaks its current run", async () => {
  const previous = [1, 2].map((day) => session({ id: `done-${day}`, status: "completed", answeredCount: 30, correctCount: 30, completedAt: new Date(`2026-10-0${day}T09:00:00Z`) }));
  const db = database({ sessions: [...previous, session({ answeredCount: 0, correctCount: 0 })] });
  const { collectTitleFacts } = await import("../src/lib/titles/facts.ts");
  assert.equal((await collectTitleFacts(db.tx, "student", now)).perfectPracticeMaxRun, 2);
  await finish(db);
  assert.equal(db.state.sessions.at(-1).status, "completed"); assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-048"), false);
});
test("practice completion timestamps preserve serialized finish order even at same clock tick", async () => {
  const db = database({ sessions: [session({ id: "done", status: "completed", answeredCount: 30, correctCount: 30, completedAt: now }), session({ answeredCount: 30, correctCount: 30 })] });
  await finish(db); assert.ok(db.state.sessions.at(-1).completedAt > now);
});
test("answer activity preserves existing hasAnswered=true and starts tracking only once", async () => {
  const db = database(); assert.equal(typeof service.recordTitleAnswer, "function");
  await db.prisma.$transaction((tx) => service.recordTitleAnswer(tx, "student", now));
  await db.prisma.$transaction((tx) => service.recordTitleAnswer(tx, "student", new Date(+now + 1000)));
  assert.equal(db.state.activities.length, 1); assert.equal(db.state.activities[0].hasAnswered, true);
  assert.equal(+db.state.profile.titleTrackingStartedAt, +now);
});
test("practice answer and counters roll back when eligibility notification fails", async () => {
  const db = database({ failNotifications: true, posts: Array.from({ length: 10 }, () => ({ deletedAt: null })) }); await assert.rejects(answer(db), /notification save failed/);
  assert.equal(db.state.practiceAnswers.length, 0); assert.equal(db.state.sessions[0].answeredCount, 29); assert.equal(db.state.activities.length, 0);
});
