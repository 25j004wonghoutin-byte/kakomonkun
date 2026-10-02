import assert from "node:assert/strict";
import test from "node:test";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";
let service = {};
try { service = await import("../src/lib/titles/random-attempts.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const now = new Date("2026-10-02T10:00:00Z");
const issue = (db) => { assert.equal(typeof service.issueRandomAttempt, "function"); return db.prisma.$transaction((tx) => service.issueRandomAttempt(tx, "student", "q", now)); };
const answer = (db, attemptId, selectedChoiceId = "correct", at = now, userId = "student") => { assert.equal(typeof service.saveRandomAnswer, "function"); return db.prisma.$transaction((tx) => service.saveRandomAnswer(tx, userId, { attemptId, selectedChoiceId }, at)); };

test("same attempt replay keeps the original answer and contributes only once", async () => {
  const db = makeLearningMemory(); const { attemptId } = await issue(db);
  const first = await answer(db, attemptId); const replay = await answer(db, attemptId, "wrong");
  assert.deepEqual(first, { alreadyAnswered: false, questionId: "q", selectedChoiceId: "correct", isCorrect: true });
  assert.deepEqual(replay, { ...first, alreadyAnswered: true });
  assert.equal(db.state.random.filter((row) => row.answeredAt).length, 1);
  assert.equal(db.state.random[0].answerSequence, 1);
  assert.equal(db.state.profile.totalPoints, 0); assert.equal(db.state.points.length, 0);
});
test("same question with a new attempt contributes a separate answer", async () => {
  const db = makeLearningMemory(); const first = await issue(db); const second = await issue(db);
  await answer(db, first.attemptId); await answer(db, second.attemptId);
  assert.deepEqual(db.state.random.map((row) => row.answerSequence), [1, 2]);
});
test("foreign attempt is rejected without saving activity", async () => {
  const db = makeLearningMemory(); const { attemptId } = await issue(db);
  await assert.rejects(answer(db, attemptId, "correct", now, "other"), (error) => error.status === 404);
  assert.equal(db.state.random[0].answeredAt, null); assert.equal(db.state.activities.length, 0);
});
test("choice from another question cannot be saved", async () => {
  const db = makeLearningMemory(); const { attemptId } = await issue(db);
  await assert.rejects(answer(db, attemptId, "unrelated"), (error) => error.status === 400);
  assert.equal(db.state.random[0].answerSequence, null);
});
test("serialized concurrent answers retain a unique commit sequence and wrong answer", async () => {
  const db = makeLearningMemory(); const first = await issue(db); const second = await issue(db); const third = await issue(db);
  await Promise.all([answer(db, first.attemptId), answer(db, second.attemptId, "wrong"), answer(db, third.attemptId)]);
  assert.deepEqual(db.state.random.map((row) => [row.answerSequence, row.isCorrect]), [[1, true], [2, false], [3, true]]);
});
test("JST midnight records separate answer days", async () => {
  const db = makeLearningMemory(); const first = await issue(db); const second = await issue(db);
  await answer(db, first.attemptId, "correct", new Date("2026-10-02T14:59:59Z"));
  await answer(db, second.attemptId, "correct", new Date("2026-10-02T15:00:00Z"));
  assert.deepEqual(db.state.random.map((row) => row.answerDate.toISOString().slice(0, 10)), ["2026-10-02", "2026-10-03"]);
  assert.deepEqual(db.state.activities.map((row) => row.hasAnswered), [true, true]);
});
test("notification failure rolls back saved answer and activity together", async () => {
  const db = makeLearningMemory({ failNotifications: true, posts: Array.from({ length: 10 }, () => ({ deletedAt: null })) }); const { attemptId } = await issue(db);
  await assert.rejects(answer(db, attemptId), /notification save failed/);
  assert.equal(db.state.random[0].answeredAt, null); assert.equal(db.state.activities.length, 0); assert.equal(db.state.unlocks.length, 0);
});
