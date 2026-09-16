import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoardBody } from "../src/lib/board/validation.ts";
import {
  canCreatePost,
  canDeleteContent,
  canPinPost,
  toBoardActor,
} from "../src/lib/board/permissions.ts";
import {
  decodeBoardCursor,
  encodeBoardCursor,
} from "../src/lib/board/cursor.ts";

test("body keeps newlines but rejects blank and 281 UTF-16 units", () => {
  assert.equal(parseBoardBody("  質問\nです  "), "質問\nです");
  assert.equal(parseBoardBody(" \n\t "), null);
  assert.equal(parseBoardBody("あ".repeat(280)), "あ".repeat(280));
  assert.equal(parseBoardBody("あ".repeat(281)), null);
});

test("teachers post normally and can pin teacher posts only", () => {
  const teacher = { id: "t", roleName: "teacher" };
  assert.deepEqual(toBoardActor("t", "teacher"), teacher);
  assert.equal(toBoardActor("x", "admin"), null);
  assert.equal(canCreatePost(teacher), true);
  assert.equal(canPinPost(teacher, "teacher"), true);
  assert.equal(canPinPost(teacher, "student"), false);
  assert.equal(
    canPinPost({ id: "s", roleName: "student" }, "teacher"),
    false,
  );
  assert.equal(canDeleteContent(teacher, "other"), true);
  assert.equal(
    canDeleteContent({ id: "s", roleName: "student" }, "other"),
    false,
  );
});

test("all cursor retains the pinned sort key", () => {
  const last = {
    isPinned: true,
    createdAt: "2026-09-16T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
  };
  assert.deepEqual(
    decodeBoardCursor("all", encodeBoardCursor("all", last)),
    last,
  );
});
