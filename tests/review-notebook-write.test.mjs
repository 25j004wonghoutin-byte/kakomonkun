import test from "node:test";
import assert from "node:assert/strict";
import { saveReviewAnswer, recordWrongPracticeAnswer } from "../src/lib/review-notebook/write.ts";
import { questionVersionOf } from "../src/lib/review-notebook/version.ts";
import { makeReviewMemory, reviewActor, reviewItemId, reviewNow, rewardState } from "./helpers/review-notebook-memory.mjs";
const input = (db, extra = {}) => ({ requestId: "22222222-2222-4222-8222-222222222222", expectedRevision: 1, questionVersion: questionVersionOf(db.state.questions[0]), selectedChoiceId: "correct", ...extra });
const save = (db, value = input(db), actor = reviewActor) => db.prisma.$transaction(tx => saveReviewAnswer(tx, actor, reviewItemId, value, reviewNow));

test("review updates only notebook state and stores reusable result", async () => {
  const db = makeReviewMemory(); const before = rewardState(db.state); const result = await save(db);
  assert.equal(result.item.status, "reviewed"); assert.equal(result.item.revision, 2);
  assert.equal(result.answer.correctChoice.label, "ア"); assert.equal(result.answer.explanation, "検証用の解説");
  assert.equal(db.state.reviewAnswers.length, 1); assert.deepEqual(rewardState(db.state), before);
});
test("lost response then new practice mistake then replay never reapplies old status", async () => {
  const db = makeReviewMemory(); const value = input(db); const original = await save(db, value);
  await db.prisma.$transaction(tx => recordWrongPracticeAnswer(tx, { userId: "student", questionId: "q", answeredAt: new Date(+reviewNow + 1000) }));
  const replay = await save(db, value);
  assert.deepEqual(replay, { ...original, replayed: true });
  assert.equal(db.state.reviewItems[0].status, "unreviewed"); assert.equal(db.state.reviewItems[0].revision, 3);
  assert.equal(+db.state.reviewItems[0].lastReviewedAt, +reviewNow); assert.equal(db.state.reviewAnswers.length, 1);
});
test("different request IDs for one revision conflict and changed payload cannot replay", async () => {
  const db = makeReviewMemory(); const value = input(db); await save(db, value);
  for (const extra of [{ requestId: "33333333-3333-4333-8333-333333333333" }, { selectedChoiceId: "wrong" }, { expectedRevision: 2 }, { questionVersion: "b".repeat(64) }]) await assert.rejects(save(db, { ...value, ...extra }), e => e.status === 409);
  assert.equal(db.state.reviewAnswers.length, 1); assert.equal(db.state.reviewItems[0].revision, 2);
});
test("incorrect review including reviewed items becomes reviewing", async () => {
  const db = makeReviewMemory(); await save(db);
  const result = await save(db, input(db, { requestId: "33333333-3333-4333-8333-333333333333", expectedRevision: 2, selectedChoiceId: "wrong" }));
  assert.equal(result.item.status, "reviewing"); assert.equal(result.answer.isCorrect, false);
});
test("invalid correct-choice configuration rolls back", async () => {
  for (const flags of [[false, false], [true, true]]) {
    const db = makeReviewMemory(); db.state.questions[0].choices.forEach((c, i) => { c.isCorrect = flags[i]; });
    const before = structuredClone(db.state); await assert.rejects(save(db), e => e.status === 500); assert.deepEqual(db.state, before);
  }
});
test("failure after item update rolls back receipt and item", async () => {
  const db = makeReviewMemory({ failReviewReceipt: true }); const before = structuredClone(db.state);
  await assert.rejects(save(db)); assert.deepEqual(db.state, before);
});
test("ownership publication question version and student checks precede grading", async () => {
  const db = makeReviewMemory();
  for (const actor of [{ ...reviewActor, id: "other" }, { ...reviewActor, roleName: "teacher" }, { ...reviewActor, status: "inactive" }]) await assert.rejects(save(db, input(db), actor), e => [401, 403, 404].includes(e.status));
  const stale = input(db); db.state.questions[0].choices[0].updatedAt = new Date(+reviewNow + 1000);
  await assert.rejects(save(db, stale), e => e.status === 409);
  await assert.rejects(save(db, input(db, { selectedChoiceId: "another-question-choice" })), e => e.status === 400);
  const value = input(db); await save(db, value); db.state.questions[0].status = "draft";
  await assert.rejects(save(db, value), e => e.status === 404); assert.equal(db.state.reviewItems[0].revision, 2);
});
