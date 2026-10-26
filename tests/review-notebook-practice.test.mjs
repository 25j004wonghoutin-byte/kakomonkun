import test from "node:test";
import assert from "node:assert/strict";
import { savePracticeAnswer, finishPracticeSession } from "../src/lib/titles/learning-events.ts";
import { makeReviewMemory, reviewNow } from "./helpers/review-notebook-memory.mjs";
const setup = extra => makeReviewMemory({ reviewItems: [], sessions: [{ id: "session", userId: "student", status: "in_progress", questionCount: 30, answeredCount: 0, correctCount: 0, earnedPoints: 0 }], sessionQuestions: [{ sessionId: "session", questionId: "q", orderNo: 1 }], ...extra });
const answer = (db, choice = "wrong", isStudent = true) => db.prisma.$transaction(tx => savePracticeAnswer(tx, { id: "student", isStudent }, "session", { questionId: "q", selectedChoiceId: choice }, reviewNow));
test("new practice mistake registers immediately without finishing and duplicate cannot register again", async () => {
  const db = setup(); await answer(db); assert.equal(db.state.reviewItems.length, 1); assert.equal(db.state.reviewItems[0].revision, 1);
  assert.equal(db.state.sessions[0].status, "in_progress"); await assert.rejects(answer(db), e => e.status === 409); assert.equal(db.state.reviewItems[0].revision, 1);
});
test("normal correct teacher answers and old completion never import notebook history", async () => {
  for (const [choice, student] of [["correct", true], ["wrong", false]]) { const db = setup(); await answer(db, choice, student); assert.equal(db.state.reviewItems.length, 0); }
  const db = setup({ practiceAnswers: [{ sessionId: "session", questionId: "q", selectedChoiceId: "wrong", isCorrect: false }] });
  await db.prisma.$transaction(tx => finishPracticeSession(tx, { id: "student", isStudent: true }, "session", reviewNow));
  assert.equal(db.state.reviewItems.length, 0);
});
test("ordinary mistake resets existing reviewed item and preserves last reviewed time", async () => {
  const db = setup(); await answer(db); const first = db.state.reviewItems[0]; first.status = "reviewed"; first.lastReviewedAt = reviewNow;
  db.state.practiceAnswers = []; await answer(db); assert.equal(db.state.reviewItems.length, 1); assert.equal(db.state.reviewItems[0].status, "unreviewed"); assert.equal(db.state.reviewItems[0].revision, 2); assert.equal(+db.state.reviewItems[0].lastReviewedAt, +reviewNow);
  db.state.practiceAnswers = []; db.state.reviewItems[0].status = "reviewing"; await answer(db, "correct"); assert.equal(db.state.reviewItems[0].status, "reviewing");
});
test("notebook registration failure rolls back ordinary answer counters and activity", async () => {
  const db = setup({ failReviewItem: true }); const before = structuredClone(db.state); await assert.rejects(answer(db)); assert.deepEqual(db.state, before);
});
