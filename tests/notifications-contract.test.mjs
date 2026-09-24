import { test } from "node:test";
import assert from "node:assert/strict";
import {
  notificationMessage,
  notificationTarget,
} from "../src/lib/notifications/contract.ts";
import {
  encodeNotificationCursor,
  parseNotificationCursor,
} from "../src/lib/notifications/cursor.ts";

test("notification presentation has no reply icon contract", () => {
  const reply = { type: "board_reply", actorName: "はると" };

  assert.equal(
    notificationMessage(reply),
    "はるとさんが投稿に返信しました",
  );
  assert.equal(
    notificationTarget({ type: "board_reply", postId: "p1" }),
    "/board/posts/p1",
  );
  assert.equal(
    notificationTarget({ type: "board_reply", postId: null }),
    null,
  );
  assert.equal(
    notificationMessage({ type: "board_pinned", actorName: "管理者" }),
    "管理者から新しいお知らせがあります",
  );
  assert.equal(
    notificationTarget({ type: "board_pinned", postId: "p2" }),
    "/board/posts/p2",
  );
  assert.equal(
    notificationMessage({ type: "title_unlocked", actorName: null }),
    "新しい称号を獲得しました",
  );
  assert.equal(
    notificationTarget({ type: "title_unlocked", postId: null }),
    "/titles",
  );
});

test("notification cursor rejects malformed data", () => {
  const value = {
    createdAt: "2026-09-24T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
  };

  assert.deepEqual(parseNotificationCursor(encodeNotificationCursor(value)), value);
  assert.equal(parseNotificationCursor("not-a-cursor"), null);
  assert.equal(
    parseNotificationCursor(
      encodeNotificationCursor({ ...value, createdAt: "not-a-date" }),
    ),
    null,
  );
  assert.equal(
    parseNotificationCursor(
      encodeNotificationCursor({ ...value, id: "not-a-uuid" }),
    ),
    null,
  );
});
