import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  parseCreatePostPayload,
  parsePinPayload,
} from "../src/lib/board/validation.ts";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

Module._load = function loadBoardPostDependency(request, ...args) {
  if (request === "@/lib/prisma") {
    return { prisma: {} };
  }
  return originalLoad.call(this, request, ...args);
};

Module._resolveFilename = function resolveBoardPostImport(request, ...args) {
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

test("create never accepts an initial pin flag", () => {
  assert.deepEqual(parseCreatePostPayload({ body: "今日の学習" }), {
    body: "今日の学習",
  });
  assert.equal(
    parseCreatePostPayload({ body: "今日の学習", isPinned: true }),
    null,
  );
  assert.deepEqual(parsePinPayload({ isPinned: true }), { isPinned: true });
  assert.equal(parsePinPayload({ isPinned: "true" }), null);
});

test("pin update and student notifications use the same transaction client", async () => {
  const { setBoardPostPinInTransaction } = require(
    "../src/lib/board/write-posts.ts",
  );
  let postUpdated = false;
  let insertedNotification;
  const tx = {
    boardPost: {
      async findUnique() {
        return {
          isPinned: false,
          deletedAt: null,
          author: { role: { name: "teacher" } },
        };
      },
      async updateMany(value) {
        assert.deepEqual(value, {
          where: { id: "post-1", deletedAt: null },
          data: { isPinned: true },
        });
        postUpdated = true;
        return { count: 1 };
      },
    },
    user: {
      async findMany() {
        assert.equal(postUpdated, true);
        return [{ id: "student-1" }];
      },
    },
    notification: {
      async createMany(value) {
        insertedNotification = value;
        return { count: 1 };
      },
    },
  };

  const result = await setBoardPostPinInTransaction(
    tx,
    { id: "teacher", roleName: "teacher" },
    "post-1",
    true,
  );

  assert.equal(result, "changed");
  assert.deepEqual(insertedNotification, {
    data: [
      {
        recipientId: "student-1",
        actorId: "teacher",
        type: "board_pinned",
        boardPostId: "post-1",
      },
    ],
    skipDuplicates: true,
  });
});
