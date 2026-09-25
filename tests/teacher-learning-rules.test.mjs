import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAccuracy,
  latestLearningAt,
  normalizeStudentPage,
} from "../src/lib/teacher/students.ts";
import { getTokyoWeekRange } from "../src/lib/tokyo-date.ts";

test("teacher learning summary handles empty and mixed activity", () => {
  assert.equal(calculateAccuracy(0, 0), 0);
  assert.equal(calculateAccuracy(7, 9), 78);
  assert.equal(latestLearningAt(null, null), null);
  assert.equal(
    latestLearningAt(
      "2026-09-20T00:00:00.000Z",
      "2026-09-21T00:00:00.000Z",
    ),
    "2026-09-21T00:00:00.000Z",
  );
  assert.equal(normalizeStudentPage("0"), 1);
  assert.equal(normalizeStudentPage("3"), 3);
});

test("Tokyo week starts on Monday across month and year boundaries", () => {
  const sunday = getTokyoWeekRange(new Date("2027-01-03T03:00:00.000Z"));
  assert.equal(sunday.start.toISOString(), "2026-12-27T15:00:00.000Z");
  assert.equal(sunday.end.toISOString(), "2027-01-03T15:00:00.000Z");

  const monday = getTokyoWeekRange(new Date("2027-01-03T15:00:00.000Z"));
  assert.equal(monday.start.toISOString(), "2027-01-03T15:00:00.000Z");
  assert.equal(monday.end.toISOString(), "2027-01-10T15:00:00.000Z");
});
