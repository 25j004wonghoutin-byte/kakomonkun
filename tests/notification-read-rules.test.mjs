import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { notificationTarget } from "../src/lib/notifications/contract.ts";
import {
  notificationReadResult,
  notificationReadWhere,
} from "../src/lib/notifications/write.ts";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveNotificationImport(request, ...args) {
  const target = request.startsWith("@/")
    ? fileURLToPath(new URL(`../src/${request.slice(2)}`, import.meta.url))
    : request;
  return originalResolveFilename.call(this, target, ...args);
};

function loadTypeScript(module, filename) {
  const source = readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(code, filename);
}

Module._extensions[".ts"] = loadTypeScript;
Module._extensions[".tsx"] = loadTypeScript;

test("read update is always scoped to notification recipient", () => {
  assert.deepEqual(
    notificationReadWhere(
      "user-a",
      "00000000-0000-4000-8000-000000000001",
    ),
    {
      id: "00000000-0000-4000-8000-000000000001",
      recipientId: "user-a",
    },
  );
});

test("a removed board post has no notification navigation target", () => {
  assert.equal(
    notificationTarget({ type: "board_reply", postId: null }),
    null,
  );
  assert.equal(
    notificationTarget({ type: "board_pinned", postId: null }),
    null,
  );
});

test("re-reading an owned notification remains a successful operation", () => {
  assert.equal(notificationReadResult(true), "changed");
  assert.equal(notificationReadResult(false), "not_found");
});

test("notification view fixes teacher identity and hides a removed target", () => {
  const { toNotificationView } = require(
    "../src/lib/notifications/read.ts",
  );
  const view = toNotificationView({
    id: "00000000-0000-4000-8000-000000000001",
    type: "board_reply",
    readAt: null,
    createdAt: new Date("2026-09-24T00:00:00.000Z"),
    actor: {
      displayName: "保存された教師名",
      role: { name: "teacher" },
    },
    boardPost: null,
    boardComment: {
      post: {
        id: "00000000-0000-4000-8000-000000000002",
        deletedAt: new Date("2026-09-25T00:00:00.000Z"),
      },
    },
  });

  assert.deepEqual(view, {
    id: "00000000-0000-4000-8000-000000000001",
    type: "board_reply",
    actorName: "管理者",
    message: "管理者さんが投稿に返信しました",
    postId: null,
    readAt: null,
    createdAt: "2026-09-24T00:00:00.000Z",
    targetAvailable: false,
  });
  assert.equal("email" in view, false);
  assert.equal("points" in view, false);
  assert.equal("studentNo" in view, false);
});

test("an empty notification cursor is rejected before querying the database", async () => {
  const { InvalidNotificationCursorError, listNotifications } = require(
    "../src/lib/notifications/read.ts",
  );

  await assert.rejects(
    () => listNotifications("user-a", ""),
    InvalidNotificationCursorError,
  );
});

test("notification inbox uses the approved single-list unread design", () => {
  const { NotificationListView } = require(
    "../src/app/notifications/notification-list.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(NotificationListView, {
      notifications: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          type: "board_reply",
          actorName: "管理者",
          message: "管理者さんが投稿に返信しました",
          postId: "00000000-0000-4000-8000-000000000010",
          readAt: null,
          createdAt: "2026-09-24T00:00:00.000Z",
          targetAvailable: true,
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          type: "board_pinned",
          actorName: "管理者",
          message: "管理者から新しいお知らせがあります",
          postId: null,
          readAt: "2026-09-25T00:00:00.000Z",
          createdAt: "2026-09-23T00:00:00.000Z",
          targetAvailable: false,
        },
      ],
      unreadCount: 1,
      activeNotificationId: null,
      unavailableNotificationId: "00000000-0000-4000-8000-000000000002",
      onSelect: () => {},
    }),
  );

  assert.match(html, /未読 1件/);
  assert.match(html, /bg-blue-50/);
  assert.match(html, /対象の投稿は削除されています。/);
  assert.doesNotMatch(html, /すべて既読にする|通知種別|>返</);
});

test("notification bell hides zero and caps the unread badge at 99+", () => {
  const { formatUnreadBadge } = require(
    "../src/components/notification-bell.tsx",
  );

  assert.equal(formatUnreadBadge(0), null);
  assert.equal(formatUnreadBadge(1), "1");
  assert.equal(formatUnreadBadge(99), "99");
  assert.equal(formatUnreadBadge(100), "99+");
});
