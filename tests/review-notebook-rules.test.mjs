import test from "node:test";
import assert from "node:assert/strict";
import { nextReviewStatus } from "../src/lib/review-notebook/rules.ts";
import { questionVersionOf } from "../src/lib/review-notebook/version.ts";
test("review result changes notebook status only", () => {
  assert.equal(nextReviewStatus(true), "reviewed"); assert.equal(nextReviewStatus(false), "reviewing");
});
test("question version is stable across choice order and detects choice-only edits", () => {
  const problem = { id: "q", updatedAt: new Date("2026-10-26T00:00:00Z"), choices: [{ id: "b", updatedAt: new Date(0) }, { id: "a", updatedAt: new Date(1) }] };
  const before = questionVersionOf(problem);
  assert.match(before, /^[0-9a-f]{64}$/);
  assert.equal(before, questionVersionOf({ ...problem, explanation: "not hashed", choices: [...problem.choices].reverse() }));
  assert.notEqual(before, questionVersionOf({ ...problem, choices: [{ ...problem.choices[0], updatedAt: new Date(2) }, problem.choices[1]] }));
  assert.throws(() => questionVersionOf({ ...problem, updatedAt: new Date("bad") }));
});
