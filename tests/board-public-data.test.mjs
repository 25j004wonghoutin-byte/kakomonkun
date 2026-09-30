import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveBoardPublicDataImport(request, ...args) {
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

const {
  toBoardAuthor,
  toBoardPublicProfileIdentity,
} = require("../src/lib/board/contract.ts");

test("public author never includes email, points or student number", () => {
  const result = toBoardAuthor({
    id: "u",
    displayName: "みさき",
    email: "private@example.com",
    role: { name: "student" },
    studentProfile: {
      avatarUrl: null,
      bio: "学習中",
      studentNo: "S1",
      totalPoints: 99,
      currentTitle: { name: "コツコツ学習者" },
    },
    teacherProfile: null,
  });

  assert.deepEqual(result, {
    id: "u",
    displayName: "みさき",
    avatarUrl: null,
    titleName: "コツコツ学習者",
    isTeacher: false,
  });
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
});

test("board always exposes the fixed teacher name", () => {
  const result = toBoardAuthor({
    id: "teacher",
    displayName: "保存された別名",
    role: { name: "teacher" },
    studentProfile: null,
    teacherProfile: { avatarUrl: null },
  });

  assert.equal(result.displayName, "管理者");
  assert.equal(result.isTeacher, true);
  assert.equal(result.titleName, null);
});

test("teacher public profile maps the stored name to the fixed teacher name", () => {
  const profile = toBoardPublicProfileIdentity({
    id: "teacher",
    displayName: "保存された別名",
    role: { name: "teacher" },
    studentProfile: null,
    teacherProfile: { avatarUrl: null },
  });

  assert.equal(profile.displayName, "管理者");
  assert.equal(profile.isTeacher, true);
});
