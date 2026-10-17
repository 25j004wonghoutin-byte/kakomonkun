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
    "新しい称号の購入条件を達成しました",
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

test("mock reminder targets its month, never the title shop or arbitrary URL", () => {
  assert.equal(notificationMessage({ type: "mock_exam_reminder", actorName: null }), "今月の模擬試験は24日まで受験できます");
  assert.equal(notificationTarget({ type: "mock_exam_reminder", postId: null, targetMonth: "2036-10" }), "/mock-exam?month=2036-10");
  for (const targetMonth of [null, undefined, "2036-13", "0000-01", "https://example.invalid", "2036-10&other=1"])
    assert.equal(notificationTarget({ type: "mock_exam_reminder", postId: null, targetMonth }), null);
});

test("reminder read DTO keeps target month and existing board/title targets unchanged", async () => {
  const {toNotificationView}=await import("../src/lib/notifications/read.ts");
  const row={id:"notice",type:"mock_exam_reminder",actor:null,boardPost:null,boardComment:null,readAt:null,createdAt:new Date("2036-10-20T00:00:00Z"),targetMonth:new Date("2036-10-01")};
  const view=toNotificationView(row);assert.equal(view.targetMonth,"2036-10");assert.equal(view.targetAvailable,true);
  assert.equal(notificationTarget(view),"/mock-exam?month=2036-10");
  assert.equal(toNotificationView({...row,targetMonth:null}).targetAvailable,false);
  assert.equal(notificationTarget(toNotificationView({...row,type:"title_unlocked",targetMonth:null})),"/titles");
  assert.equal(notificationTarget(toNotificationView({...row,type:"board_pinned",targetMonth:null,boardPost:{id:"post",deletedAt:null}})),"/board/posts/post");
});
