import test from "node:test";
import assert from "node:assert/strict";
import { questionVersionOf } from "../src/lib/review-notebook/version.ts";
import { reviewActor as actor, reviewItem, reviewItemId as itemId, reviewQuestion } from "./helpers/review-notebook-memory.mjs";
import * as service from "../src/lib/review-notebook/ai-explanation.ts";
import * as handlersModule from "../src/lib/review-notebook/ai-handler.ts";
const input = question => ({ answerRevision: 2, questionVersion: questionVersionOf(question) });
function setup() {
  const question = { ...reviewQuestion(), imagePath: "/official-question.png", questionText: "" };
  const state = { user: { status: "active", deletedAt: null, role: { name: "student" } }, item: reviewItem({ revision: 2, question }), receipt: { id: "receipt", userId: actor.id, itemId, expectedRevision: 1, questionVersion: questionVersionOf(question) } };
  const generated = [];
  const tx = {
    user: { findUnique: async ({ where }) => where.id === actor.id ? state.user : null },
    reviewNotebookItem: { findUnique: async ({ where }) => state.item?.id === where.id && state.item?.userId === where.userId ? state.item : null },
    reviewNotebookAnswer: { findFirst: async ({ where }) => state.receipt && Object.entries(where).every(([key, value]) => state.receipt[key] === value) ? state.receipt : null },
  };
  const db = { $transaction: async read => read(tx) };
  const generate = async value => { generated.push(value); return { explanation: "## 図の読み方\n元画像に基づく解説", fromCache: true, modelName: "cached-model" }; };
  const explain = (value = input(question), currentActor = actor, generator = generate) => {
    assert.equal(typeof service.explainReviewAnswer, "function", "saved review answers need an AI explanation service");
    return service.explainReviewAnswer(db, currentActor, itemId, value, generator);
  };
  return { state, question, generated, explain };
}
test("current saved answer reuses image-aware generator and cached result without reward writes", async () => {
  const h = setup(), before = structuredClone(h.state);
  assert.deepEqual(await h.explain(), { explanation: "## 図の読み方\n元画像に基づく解説", fromCache: true });
  assert.deepEqual(h.generated, [{ questionId: "q", userId: "student" }]);
  assert.deepEqual(h.state, before);
  assert.equal(h.question.imagePath, "/official-question.png");
});
test("inactive deleted or non-student actors never generate explanations", async () => {
  for (const [change, status] of [[{ status: "inactive" }, 401], [{ deletedAt: new Date() }, 401], [{ roleName: "teacher" }, 403]]) {
    const h = setup(); await assert.rejects(h.explain(undefined, { ...actor, ...change }), error => error.status === status); assert.equal(h.generated.length, 0);
  }
});
test("fresh database identity blocks revoked student access before generation", async () => {
  for (const [change, status] of [[{ status: "inactive" }, 401], [{ deletedAt: new Date() }, 401], [{ role: { name: "teacher" } }, 403]]) {
    const h = setup(); Object.assign(h.state.user, change); await assert.rejects(h.explain(), error => error.status === status); assert.equal(h.generated.length, 0);
  }
});
test("another owner missing unpublished or deleted questions never reach generation", async () => {
  for (const change of [h => { h.state.item.userId = "another"; }, h => { h.state.item = null; }, h => { h.question.status = "draft"; }, h => { h.question.deletedAt = new Date(); }]) {
    const h = setup(); change(h); await assert.rejects(h.explain(), error => error.status === 404); assert.equal(h.generated.length, 0);
  }
});
test("a notebook entry without the matching saved answer receipt cannot reveal AI", async () => {
  for (const change of [h => { h.state.receipt = null; }, h => { h.state.receipt.userId = "another"; }, h => { h.state.receipt.itemId = "another"; }, h => { h.state.receipt.expectedRevision = 0; }, h => { h.state.receipt.questionVersion = "b".repeat(64); }]) {
    const h = setup(); change(h); await assert.rejects(h.explain(), error => error.status === 409); assert.equal(h.generated.length, 0);
  }
});
test("outdated item revision or edited question and choices are rejected before generation", async () => {
  for (const change of [h => { h.state.item.revision = 3; }, h => { h.question.updatedAt = new Date("2026-11-04T02:00:00Z"); }, h => { h.question.choices[0].updatedAt = new Date("2026-11-04T02:00:00Z"); }]) {
    const h = setup(), original = input(h.question); change(h); await assert.rejects(h.explain(original), error => error.status === 409); assert.equal(h.generated.length, 0);
  }
});
test("late generation cannot return private content after publication version answer or account changes", async () => {
  for (const change of [h => { h.question.status = "draft"; }, h => { h.question.updatedAt = new Date("2026-11-04T02:00:00Z"); }, h => { h.state.item.revision = 3; }, h => { h.state.user.status = "inactive"; }]) {
    const h = setup();
    await assert.rejects(h.explain(undefined, actor, async () => { change(h); return { explanation: "private late result", fromCache: false }; }), error => [401, 404, 409].includes(error.status));
  }
});
test("provider failure leaves saved answers unchanged and permits an explicit retry", async () => {
  const h = setup(), before = structuredClone(h.state);
  await assert.rejects(h.explain(undefined, actor, async () => { throw Error("provider unavailable"); }), /provider unavailable/);
  assert.deepEqual(h.state, before); assert.equal((await h.explain()).fromCache, true);
});
const routeId = "11111111-1111-4111-8111-111111111111";
const request = body => new Request("https://app.example/api/review-notebook/" + routeId + "/ai-explanation", { method: "POST", body: JSON.stringify(body) });
function handler(user = { ...actor, id: routeId }) {
  const calls = [];
  assert.equal(typeof handlersModule.createReviewAiHandler, "function", "review AI requests need authenticated private handling");
  return { calls, handle: handlersModule.createReviewAiHandler({ getUser: async () => user, explain: async (...args) => { calls.push(args); return { explanation: "解説", fromCache: true }; } }) };
}
test("AI route authenticates before body parsing and uses private no-store responses", async () => {
  for (const [user, status] of [[null, 401], [{ ...actor, roleName: "teacher" }, 403], [{ ...actor, status: "inactive" }, 401]]) {
    const h = handler(user), req = request({ bad: true }), response = await h.handle(req, { itemId: routeId });
    assert.equal(response.status, status); assert.equal(req.bodyUsed, false); assert.equal(h.calls.length, 0);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0"); assert.equal(response.headers.get("vary"), "Cookie");
  }
});
test("AI route rejects missing revisions versions extra owners and malformed JSON before service", async () => {
  const h = handler(), valid = { answerRevision: 2, questionVersion: "a".repeat(64) };
  for (const body of [{}, { ...valid, userId: "other" }, { ...valid, answerRevision: 0 }, { ...valid, answerRevision: 1.5 }, { ...valid, answerRevision: 2147483648 }, { ...valid, questionVersion: "bad" }]) assert.equal((await h.handle(request(body), { itemId: routeId })).status, 400);
  assert.equal((await h.handle(new Request("https://app.example", { method: "POST", body: "{" }), { itemId: routeId })).status, 400);
  assert.equal((await h.handle(request(valid), { itemId: "bad" })).status, 400); assert.equal(h.calls.length, 0);
  const response = await h.handle(request(valid), { itemId: routeId });
  assert.equal(response.status, 200); assert.deepEqual(h.calls[0], [{ ...actor, id: routeId }, routeId, valid]);
});
test("AI route hides provider secrets and exposes a retryable error", async () => {
  assert.equal(typeof handlersModule.createReviewAiHandler, "function");
  const handle = handlersModule.createReviewAiHandler({ getUser: async () => actor, explain: async () => { throw Error("provider-private-key"); } });
  const response = await handle(request({ answerRevision: 2, questionVersion: "a".repeat(64) }), { itemId: routeId });
  assert.equal(response.status, 500); const body = await response.json(); assert.match(body.error, /再試行/); assert.doesNotMatch(JSON.stringify(body), /provider-private-key/);
});
