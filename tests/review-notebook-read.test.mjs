import test from "node:test";
import assert from "node:assert/strict";
import { readReviewList, readReviewItem, countPracticeReviewItems } from "../src/lib/review-notebook/read.ts";
import { makeReviewMemory, reviewItem, reviewItemId, reviewNow, reviewQuestion } from "./helpers/review-notebook-memory.mjs";
const query = { status: "unfinished", examCode: null, categoryCode: null, page: 1, sessionId: null };
const database = overrides => { const memory = makeReviewMemory(overrides); return { ...memory, db: { ...memory.tx, ...memory.prisma } }; };
test("list pages zero ten and eleven visible entries and clamps overflow", async () => {
  for (const count of [0, 10, 11]) {
    const questions = Array.from({ length: count }, (_, i) => ({ ...reviewQuestion(), id: `q-${i}` }));
    const items = questions.map((q, i) => reviewItem({ id: String(i).padStart(3, "0"), questionId: q.id }));
    const { db } = database({ questions, reviewItems: items });
    const first = await readReviewList(db, "student", query);
    assert.equal(first.total, count); assert.equal(first.items.length, Math.min(count, 10)); assert.equal(first.pageCount, count > 10 ? 2 : 1);
    const last = await readReviewList(db, "student", { ...query, page: 9007199254740991 });
    assert.equal(last.query.page, count > 10 ? 2 : 1); assert.equal(last.items.length, count > 10 ? 1 : count);
    if (count) assert.equal(first.items[0].id, "000");
  }
});
test("list intersects owner state exam category publication and session without backfill", async () => {
  const q = reviewQuestion(); const { db, state } = database({ questions: [q, { ...q, id: "other-q", status: "draft" }, { ...q, id: "deleted-q", deletedAt: reviewNow }], reviewItems: [reviewItem(), reviewItem({ id: "other", userId: "other" }), reviewItem({ id: "draft", questionId: "other-q" }), reviewItem({ id: "deleted", questionId: "deleted-q" })], sessions: [{ id: "session", userId: "student" }, { id: "other-session", userId: "other" }], practiceAnswers: [{ sessionId: "session", questionId: "q", isCorrect: false }, { sessionId: "session", questionId: "legacy", isCorrect: false }] });
  const before = structuredClone(state);
  assert.equal((await readReviewList(db, "student", { ...query, sessionId: "session" })).total, 1);
  assert.equal(await countPracticeReviewItems(db, "student", "session"), 1);
  assert.equal((await readReviewList(db, "student", { ...query, examCode: "fe" })).total, 0);
  assert.equal((await readReviewList(db, "student", { ...query, categoryCode: "strategy" })).total, 0);
  assert.equal((await readReviewList(db, "student", { ...query, status: "reviewed" })).total, 0);
  await assert.rejects(readReviewList(db, "student", { ...query, sessionId: "other-session" }), e => e.status === 404);
  assert.deepEqual(state, before);
});
test("detail is public question DTO without hidden grading fields and image-only list has a preview", async () => {
  const { db, state } = database(); const detail = await readReviewItem(db, "student", reviewItemId);
  assert.deepEqual(detail.question.choices[0], { id: "correct", label: "ア", text: "正解" });
  for (const hidden of ["correctChoice", "isCorrect", "explanation", "choiceLabel"]) assert.equal(JSON.stringify(detail).includes(`"${hidden}"`), false);
  await assert.rejects(readReviewItem(db, "other", reviewItemId), e => e.status === 404);
  state.questions[0].questionText = ""; state.questions[0].imagePath = "/question.png";
  assert.equal((await readReviewList(db, "student", query)).items[0].questionPreview, "画像問題");
  state.questions[0].questionText = "あ😀".repeat(80);
  assert.equal(Array.from((await readReviewList(db, "student", query)).items[0].questionPreview).length, 120);
});
