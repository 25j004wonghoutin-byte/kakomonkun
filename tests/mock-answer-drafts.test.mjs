import assert from "node:assert/strict";
import test from "node:test";
import { addAnswerDraft, settleAnswerDraft, projectAnswerDrafts } from "../src/lib/mock-exams/answer-drafts.ts";
const initial = () => ({ id: "attempt", revision: 4, serverNow: "2026-11-04T00:00:00Z", answers: [
 { mockQuestionId: "q1", selectedChoiceId: null, revision: 2 }, { mockQuestionId: "q2", selectedChoiceId: "old", revision: 1 },
] });
const input = (requestId, mockQuestionId, selectedChoiceId) => ({ attemptId: "attempt", requestId, mockQuestionId, selectedChoiceId, expectedRevision: 2 });
test("selection appears before a save acknowledgement without mutating confirmed answers", () => {
 const confirmed = initial(); const drafts = addAnswerDraft({}, input("a", "q1", "new"));
 const visible = projectAnswerDrafts(confirmed, drafts);
 assert.equal(visible.answers[0].selectedChoiceId, "new");
 assert.equal(confirmed.answers[0].selectedChoiceId, null);
 assert.equal(visible.revision, 4); assert.equal(visible.answers[0].revision, 2); assert.equal(visible.serverNow, confirmed.serverNow);
});
test("a late acknowledgement cannot erase a newer rapid selection", () => {
 const a = input("a", "q1", "first"), b = input("b", "q1", "last");
 const drafts = addAnswerDraft(addAnswerDraft({}, a), b);
 const remaining = settleAnswerDraft(drafts, a);
 assert.equal(projectAnswerDrafts(initial(), remaining).answers[0].selectedChoiceId, "last");
 assert.equal(remaining, drafts);
 assert.deepEqual(settleAnswerDraft(remaining, b), {});
});
test("acknowledging one question retains other pending answers", () => {
 const a = input("a", "q1", "new"), b = input("b", "q2", "other");
 const drafts = addAnswerDraft(addAnswerDraft({}, a), b);
 const remaining = settleAnswerDraft(drafts, a);
 assert.equal(projectAnswerDrafts(initial(), remaining).answers[1].selectedChoiceId, "other");
 assert.equal(Object.keys(remaining).length, 1);
});
test("clearing a selected answer is visible while saving and acknowledgement reveals server truth", () => {
 const a = input("clear", "q2", null), confirmed = initial();
 const drafts = addAnswerDraft({}, a);
 assert.equal(projectAnswerDrafts(confirmed, drafts).answers[1].selectedChoiceId, null);
 const updated = { ...confirmed, revision: 5, answers: confirmed.answers.map(answer => answer.mockQuestionId === "q2" ? { ...answer, selectedChoiceId: null, revision: 2 } : answer) };
 assert.equal(projectAnswerDrafts(updated, settleAnswerDraft(drafts, a)), updated);
});
