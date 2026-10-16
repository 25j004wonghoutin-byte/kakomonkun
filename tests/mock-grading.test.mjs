import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const moduleUrl = new URL("../src/lib/mock-exams/grading.ts", import.meta.url);
const grading = async () => {
  assert.ok(existsSync(moduleUrl), "mock exam grading implementation is required");
  return import(moduleUrl.href);
};

// Catches integer division, missing percent conversion and incorrect half-up rounding.
for (const [correct, total, want] of [[0, 60, 0], [60, 60, 100], [50, 60, 83.33], [59, 60, 98.33], [1, 60, 1.67], [87, 100, 87], [1, 32, 3.13]]) {
  test(`${correct}/${total} is ${want} out of 100 with equal question weights`, async () => {
    const { scorePercent } = await grading();
    assert.equal(scorePercent(correct, total), want);
  });
}

test("malformed answer counts cannot create invalid or over-100 results", async () => {
  const { scorePercent } = await grading();
  for (const [correct, total] of [[0, 0], [-1, 60], [61, 60], [1.5, 60], [1, 2.5], [NaN, 60], [1, Infinity], [Infinity, 60], [0, -1], [1, "60"], [null, 60], [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1]]) {
    assert.throws(() => scorePercent(correct, total), (e) => e.status === 400);
  }
});
