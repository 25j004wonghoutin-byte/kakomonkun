import test from "node:test";
import assert from "node:assert/strict";
import { createReviewSessionGuard } from "../src/lib/review-notebook/session-guard.ts";
import * as ai from "../src/lib/review-notebook/ai-controller.ts";
const detail = { id: "item", questionVersion: "a".repeat(64) }, answer = { item: { id: "item", revision: 2 } };
const result = { explanation: "保存した回答のAI解説", fromCache: true };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function setup(send, saved = answer) {
  assert.equal(typeof ai.createReviewAiController, "function", "review AI must be requested only for a saved result");
  const states = [], controller = ai.createReviewAiController({ detail, result: saved, send, onState: value => states.push(structuredClone(value)) });
  return { states, controller };
}
test("AI starts only on click and sends the saved answer revision and question version", async () => {
  const sent = [], h = setup(async (...args) => { sent.push(args); return result; });
  assert.equal(sent.length, 0); await h.controller.request();
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].slice(0, 2), ["item", { answerRevision: 2, questionVersion: "a".repeat(64) }]); assert.ok(sent[0][2] instanceof AbortSignal);
  assert.deepEqual(h.states.at(-1).result, result);
});
test("unsaved and mismatched results cannot request an explanation", async () => {
  let calls = 0;
  for (const saved of [null, { item: { id: "another", revision: 2 } }]) { const h = setup(async () => { calls++; return result; }, saved); await h.controller.request(); }
  assert.equal(calls, 0);
});
test("rapid clicks deduplicate pending and already displayed explanations", async () => {
  const response = deferred(); let calls = 0; const h = setup(() => { calls++; return response.promise; });
  const pending = h.controller.request(); await h.controller.request(); assert.equal(calls, 1); assert.equal(h.states.at(-1).loading, true);
  response.resolve(result); await pending; await h.controller.request(); assert.equal(calls, 1); assert.equal(h.states.at(-1).loading, false);
});
test("provider failure is visible and a click retries the same saved result", async () => {
  let calls = 0; const h = setup(async () => { if (++calls === 1) throw Error("offline"); return result; });
  await h.controller.request(); assert.equal(h.states.at(-1).loading, false); assert.match(h.states.at(-1).error, /再試行/); assert.equal(h.states.at(-1).result, null);
  await h.controller.request(); assert.deepEqual(h.states.at(-1).result, result); assert.equal(calls, 2);
});
test("stale unauthorized and unavailable responses clear AI content and block retries", async () => {
  for (const [status, key] of [[409, "requiresReload"], [400, "requiresReload"], [401, "requiresLogin"], [403, "unavailable"], [404, "unavailable"]]) {
    let calls = 0; const h = setup(async () => { calls++; throw Object.assign(Error("denied"), { status }); });
    await h.controller.request(); await h.controller.request(); assert.equal(calls, 1); assert.equal(h.states.at(-1)[key], true); assert.equal(h.states.at(-1).result, null);
  }
});
test("reset or item/version replacement aborts old generation and ignores its late result", async () => {
  const response = deferred(); let signal; const h = setup((_id, _input, requestSignal) => { signal = requestSignal; return response.promise; });
  const pending = h.controller.request(); h.controller.dispose(); assert.equal(signal.aborted, true); const count = h.states.length;
  const fresh = setup(async () => ({ explanation: "新しい問題の解説", fromCache: false })); await fresh.controller.request();
  response.resolve(result); await pending; assert.equal(h.states.length, count); assert.equal(fresh.states.at(-1).result.explanation, "新しい問題の解説");
});
test("existing review guard rejects account switched AI responses and cancels hidden sessions", async () => {
  for (const reason of ["account", "hidden"]) {
    let owner = "student-a"; const response = deferred(), windowTarget = new EventTarget(), documentTarget = new EventTarget(); documentTarget.visibilityState = "visible";
    let h; const guard = createReviewSessionGuard({ ownerId: owner, readIdentity: async () => owner, onInvalidate: () => h.controller.dispose(), onRestore() {}, onMismatch() {} });
    const stop = guard.observe(windowTarget, documentTarget);
    h = setup((_id, _input, signal) => guard.run(() => response.promise, signal));
    const pending = h.controller.request(); const count = h.states.length;
    if (reason === "account") owner = "student-b"; else { documentTarget.visibilityState = "hidden"; documentTarget.dispatchEvent(new Event("visibilitychange")); }
    response.resolve(result); await pending; assert.equal(h.states.length, count); assert.equal(h.states.at(-1).result, null); stop();
  }
});

test("changing the item or account starts a separate private client session", async () => {
  const [{ readFileSync }, { createRequire }, vm, ts] = await Promise.all([import("node:fs"), import("node:module"), import("node:vm"), import("typescript")]);
  const url = new URL("../src/app/review-notebook/[itemId]/review-question-client.tsx", import.meta.url);
  const source = readFileSync(url, "utf8"), require = createRequire(url);
  const { outputText } = ts.default.transpileModule(source, { compilerOptions: { module: ts.default.ModuleKind.CommonJS, target: ts.default.ScriptTarget.ES2022, jsx: ts.default.JsxEmit.ReactJSX } });
  const exports = {};
  vm.default.runInNewContext(outputText, { exports, URLSearchParams, require(id) {
    if (id === "react") return { useEffect() {}, useMemo: calculate => calculate(), useRef: value => ({ current: value }), useState: value => [typeof value === "function" ? value() : value, () => {}] };
    if (id === "next/navigation") return { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() };
    if (id === "./review-question-view") return { ReviewQuestionView: () => null };
    return require(id);
  } }, { filename: "review-question-client.tsx" });
  const a = exports.ReviewQuestionClient({ itemId: "item-a", ownerId: "student-a" });
  const b = exports.ReviewQuestionClient({ itemId: "item-b", ownerId: "student-a" });
  const otherAccount = exports.ReviewQuestionClient({ itemId: "item-a", ownerId: "student-b" });
  assert.notEqual(a.key, b.key, "another question must not inherit the previous AI state");
  assert.notEqual(a.key, otherAccount.key, "another account must not inherit the previous AI state");
});
