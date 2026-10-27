import test from "node:test";
import assert from "node:assert/strict";
import { createReviewAnswerController } from "../src/lib/review-notebook/answer-controller.ts";
import * as answerClient from "../src/lib/review-notebook/answer-controller.ts";
const detail = { id: "item", revision: 1, questionVersion: "a".repeat(64), question: { choices: [{ id: "choice" }, { id: "other" }] } };
const result = { item: { id: "item", status: "reviewed", revision: 2, lastReviewedAt: "2026-10-26T00:00:00Z" }, answer: { isCorrect: true }, replayed: false };
function setup(send) { const states = []; let id = 0; return { states, controller: createReviewAnswerController({ detail, send, newId: () => `request-${++id}`, onState: value => states.push(structuredClone(value)) }) }; }
test("network retry preserves exact input and blocks duplicate or changed submission", async () => {
  const sent = []; let calls = 0; const { controller, states } = setup(async (itemId, input) => { sent.push([itemId, structuredClone(input)]); if (++calls === 1) throw Error("network failed"); return result; });
  await controller.submit("choice"); assert.equal(states.at(-1).result, null); assert.ok(states.at(-1).pending);
  await controller.submit("other"); assert.equal(sent.length, 1);
  await controller.retry(); assert.deepEqual(sent[1], sent[0]); assert.equal(states.at(-1).result.item.status, "reviewed");
});
test("new attempt gets new request ID and current revision after reset", async () => {
  const sent = []; const { controller } = setup(async (_id, input) => { sent.push(input); return result; });
  await controller.submit("choice"); controller.reset({ ...detail, revision: 3 }); await controller.submit("choice");
  assert.notEqual(sent[0].requestId, sent[1].requestId); assert.equal(sent[1].expectedRevision, 3);
});
test("409 requires reload without automatic resubmit", async () => {
  let calls = 0; const { controller, states } = setup(async () => { calls++; throw Object.assign(Error("conflict"), { status: 409 }); });
  await controller.submit("choice"); await controller.retry(); assert.equal(calls, 1); assert.equal(states.at(-1).requiresReload, true); assert.equal(states.at(-1).result, null);
});
test("401 or 404 clears private result and blocks retry", async () => {
  for (const status of [401, 404]) { const { controller, states } = setup(async () => { throw Object.assign(Error("error"), { status }); }); await controller.submit("choice"); const state = states.at(-1); assert.equal(state.result, null); assert.equal(state.pending, null); assert.equal(status === 401 ? state.requiresLogin : state.unavailable, true); }
});
test("dispose ignores late result and concurrent submit is not sent twice", async () => {
  let resolve, calls = 0; const pending = new Promise(yes => { resolve = yes; }); const { controller, states } = setup(() => { calls++; return pending; });
  const first = controller.submit("choice"); await controller.submit("choice"); assert.equal(calls, 1); controller.dispose(); const count = states.length; resolve(result); await first; assert.equal(states.length, count);
});
test("receipt replay after question edit refreshes status without mixing new question and old answer", async () => {
  const original = { ...detail, status: "unreviewed", lastWrongAt: "2026-10-26T00:00:00Z", lastReviewedAt: null, question: { text: "Original question", choices: [{ id: "choice" }, { id: "other" }] } };
  const sent = []; let calls = 0;
  const controller = createReviewAnswerController({ detail: original, newId: () => "same-request", onState() {}, send: async (_id, input) => { sent.push(input); if (++calls === 1) throw Error("response lost"); return { ...result, replayed: true }; } });
  await controller.submit("choice"); await controller.retry();
  assert.deepEqual(sent[0], sent[1]);
  const current = { ...original, revision: 4, status: "unreviewed", lastWrongAt: "2026-10-27T00:00:00Z", lastReviewedAt: result.item.lastReviewedAt, questionVersion: "b".repeat(64), question: { text: "Edited question", choices: [{ id: "new-choice" }] } };
  assert.equal(typeof answerClient.mergeCurrentReviewStatus, "function", "post-answer refresh must preserve the answered question snapshot");
  const refreshed = answerClient.mergeCurrentReviewStatus(original, current);
  assert.equal(refreshed.question, original.question);
  assert.equal(refreshed.questionVersion, original.questionVersion);
  assert.equal(refreshed.status, current.status); assert.equal(refreshed.revision, current.revision);
  assert.equal(refreshed.lastWrongAt, current.lastWrongAt); assert.equal(refreshed.lastReviewedAt, current.lastReviewedAt);
});
