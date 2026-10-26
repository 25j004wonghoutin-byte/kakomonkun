import test from "node:test";
import assert from "node:assert/strict";
import { createReviewNotebookHandlers } from "../src/lib/review-notebook/handlers.ts";
import { ReviewNotebookError } from "../src/lib/review-notebook/contract.ts";
const id = "11111111-1111-4111-8111-111111111111";
const actor = { id, roleName: "student", status: "active", deletedAt: null };
const payload = { requestId: id, expectedRevision: 1, questionVersion: "a".repeat(64), selectedChoiceId: id };
const request = body => new Request("https://app.example/api/review-notebook", { method: "POST", body: JSON.stringify(body) });
function setup(user = actor) {
  const calls = [];
  const service = { list: async (...args) => { calls.push(args); return { total: 0 }; }, item: async (...args) => { calls.push(args); return { id }; }, answer: async (...args) => { calls.push(args); return { replayed: false }; } };
  return { calls, service, handlers: createReviewNotebookHandlers({ getUser: async () => user, service }) };
}
test("authentication precedes body parsing and every response is private", async () => {
  for (const [user, status] of [[null, 401], [{ ...actor, roleName: "teacher" }, 403], [{ ...actor, status: "inactive" }, 401]]) {
    const { handlers, calls } = setup(user); const req = request(payload);
    for (const response of [await handlers.list(new Request("https://app.example/api/review-notebook?bad=1")), await handlers.item(req, { itemId: id }), await handlers.answer(req, { itemId: id })]) {
      assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0"); assert.equal(response.headers.get("vary"), "Cookie");
    }
    assert.equal(req.bodyUsed, false); assert.equal(calls.length, 0);
  }
});
test("invalid identifiers queries JSON or extra owner fields never reach service", async () => {
  const { handlers, calls } = setup();
  assert.equal((await handlers.item(new Request("https://app.example"), { itemId: "bad" })).status, 400);
  assert.equal((await handlers.list(new Request("https://app.example?userId=other"))).status, 400);
  assert.equal((await handlers.answer(request({ ...payload, userId: id }), { itemId: id })).status, 400);
  assert.equal((await handlers.answer(new Request("https://app.example", { method: "POST", body: "{" }), { itemId: id })).status, 400);
  assert.equal(calls.length, 0);
});
test("valid inputs derive owner from auth and errors preserve only safe status", async () => {
  const { handlers, calls, service } = setup();
  assert.equal((await handlers.answer(request(payload), { itemId: id })).status, 200); assert.deepEqual(calls[0], [actor, id, payload]);
  for (const status of [404, 409]) { service.item = async () => { throw new ReviewNotebookError("expected", status, "再読み込みしてください。"); }; assert.equal((await handlers.item(new Request("https://app.example"), { itemId: id })).status, status); }
  service.item = async () => { throw Error("private-db-secret"); };
  const response = await handlers.item(new Request("https://app.example"), { itemId: id }); assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /private-db-secret/);
});
