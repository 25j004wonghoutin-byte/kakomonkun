import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parseBoardBody, isUuid } from "../src/lib/board/validation.ts";
import { canInteractWithPost } from "../src/lib/board/permissions.ts";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

Module._load = function loadBoardCommentDependency(request, ...args) {
  if (request === "@/lib/prisma") {
    return { prisma: {} };
  }
  return originalLoad.call(this, request, ...args);
};

Module._resolveFilename = function resolveBoardCommentImport(request, ...args) {
  const target = request.startsWith("@/")
    ? fileURLToPath(new URL(`../src/${request.slice(2)}`, import.meta.url))
    : request;
  return originalResolveFilename.call(this, target, ...args);
};

function loadTypeScript(module, filename) {
  const source = readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(code, filename);
}

Module._extensions[".ts"] = loadTypeScript;

test("reply shares the post body limit and requires a UUID target", () => {
  assert.equal(parseBoardBody("\n  お答えします  "), "お答えします");
  assert.equal(parseBoardBody("あ".repeat(281)), null);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(canInteractWithPost(null), true);
  assert.equal(canInteractWithPost(new Date()), false);
});

test("reply creation emits its notification through the same transaction client", async () => {
  const { createBoardCommentInTransaction } = require(
    "../src/lib/board/write-comments.ts",
  );
  let commentCreated = false;
  let insertedNotification;
  const memory = makeLearningMemory({
      user: { id: "reply-author", displayName: "返信者", role: { name: "student" }, status: "active", deletedAt: null },
      profile: { userId: "reply-author", titleTrackingStartedAt: null, titleBackfilledAt: null, totalPoints: 0 },
    });
  const tx = {
    ...memory.tx,
    boardPost: {
      ...memory.tx.boardPost,
      async findUnique() {
        return {
          authorId: "post-author",
          deletedAt: null,
          author: { status: "active", deletedAt: null },
        };
      },
    },
    boardComment: {
      ...memory.tx.boardComment,
      async create() {
        commentCreated = true;
        return {
          id: "comment-1",
          postId: "post-1",
          authorId: "reply-author",
          body: "回答です",
          createdAt: new Date("2026-09-30T00:00:00.000Z"),
        };
      },
    },
    notification: {
      async createMany(value) {
        assert.equal(commentCreated, true);
        insertedNotification = value;
        return { count: 1 };
      },
    },
  };

  const created = await createBoardCommentInTransaction(
    tx,
    { id: "reply-author", roleName: "student" },
    "post-1",
    "回答です",
  );

  assert.equal(created.id, "comment-1");
  assert.deepEqual(insertedNotification, {
    data: [
      {
        recipientId: "post-author",
        actorId: "reply-author",
        type: "board_reply",
        boardCommentId: "comment-1",
      },
    ],
    skipDuplicates: true,
  });
});
