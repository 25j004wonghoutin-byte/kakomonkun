import test from "node:test";
import assert from "node:assert/strict";
import * as config from "../src/lib/practice-config.ts";
import { decodeBoardCursor, encodeBoardCursor } from "../src/lib/board/cursor.ts";

test("IT passport offers100 questions while FE remains30/60 and rewards remain compatible", () => {
  assert.equal(typeof config.getPracticeQuestionCounts, "function");
  assert.deepEqual(config.getPracticeQuestionCounts("it_passport"), [30, 60, 100]);
  assert.deepEqual(config.getPracticeQuestionCounts("fe"), [30, 60]);
  assert.equal(config.isPracticeQuestionCount(100), true);
  assert.equal(config.getPracticeCompletionPoints(100), 25);
  assert.equal(config.getPracticeCompletionPoints(30), 5);
  assert.equal(config.getPracticeCompletionPoints(60), 15);
  assert.equal(config.getPracticeCompletionPoints(99), 0);
});
test("board cursor preserves validated reply activity and remains compatible with profile pagination", () => {
  const row = { id: "00000000-0000-4000-8000-000000000001", isPinned: false, createdAt: "2026-01-01T00:00:00Z", activityAt: "2026-11-04T00:00:00Z" };
  assert.deepEqual(decodeBoardCursor("all", encodeBoardCursor("all", row)), row);
  const mine = { id: row.id, createdAt: row.createdAt };
  assert.deepEqual(decodeBoardCursor("mine", encodeBoardCursor("mine", mine)), mine);
  const invalid = Buffer.from(JSON.stringify({ ...row, activityAt: "not-a-date" })).toString("base64url");
  assert.equal(decodeBoardCursor("all", invalid), null);
});
