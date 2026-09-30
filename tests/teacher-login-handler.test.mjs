import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveTeacherLoginImport(request, ...args) {
  const target = request.startsWith("@/")
    ? fileURLToPath(new URL(`../src/${request.slice(2)}`, import.meta.url))
    : request;
  return originalResolveFilename.call(this, target, ...args);
};

Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(code, filename);
};

const { authenticateTeacherLogin } = require("../src/lib/teacher/login.ts");

function createDependencies(overrides = {}) {
  const calls = { signIn: [], signOut: 0, marked: [] };
  const dependencies = {
    configuredAccount: "teacher.admin",
    async signIn(credentials) {
      calls.signIn.push(credentials);
      return { userId: "auth-user" };
    },
    async findAppUser() {
      return { id: "app-user", roleName: "teacher", status: "active" };
    },
    async markLogin(userId) {
      calls.marked.push(userId);
    },
    async signOut() {
      calls.signOut += 1;
    },
    ...overrides,
  };

  return { calls, dependencies };
}

test("teacher login derives the internal email and accepts an active teacher", async () => {
  const { calls, dependencies } = createDependencies();
  const result = await authenticateTeacherLogin(
    { account: " Teacher.Admin ", password: "valid-password" },
    dependencies,
  );

  assert.deepEqual(result, { status: 200, body: { next: "/teacher" } });
  assert.deepEqual(calls.signIn, [
    { email: "teacher.admin@teacher.local", password: "valid-password" },
  ]);
  assert.deepEqual(calls.marked, ["app-user"]);
  assert.equal(calls.signOut, 0);
});

test("teacher login rejects a wrong account before calling Supabase", async () => {
  const { calls, dependencies } = createDependencies();
  const result = await authenticateTeacherLogin(
    { account: "another-teacher", password: "valid-password" },
    dependencies,
  );

  assert.equal(result.status, 401);
  assert.equal(calls.signIn.length, 0);
});

test("teacher login rejects a password refused by Supabase", async () => {
  const { calls, dependencies } = createDependencies({
    async signIn(credentials) {
      calls.signIn.push(credentials);
      return { userId: null };
    },
  });
  const result = await authenticateTeacherLogin(
    { account: "teacher.admin", password: "wrong-password" },
    dependencies,
  );

  assert.equal(result.status, 401);
  assert.equal(calls.signOut, 0);
});

test("teacher login signs out an authenticated non-teacher", async () => {
  const { calls, dependencies } = createDependencies({
    async findAppUser() {
      return { id: "student", roleName: "student", status: "active" };
    },
  });
  const result = await authenticateTeacherLogin(
    { account: "teacher.admin", password: "valid-password" },
    dependencies,
  );

  assert.equal(result.status, 403);
  assert.equal(calls.signOut, 1);
});

test("teacher login signs out when app-user verification fails", async () => {
  const { calls, dependencies } = createDependencies({
    async findAppUser() {
      throw new Error("database unavailable");
    },
  });
  const result = await authenticateTeacherLogin(
    { account: "teacher.admin", password: "valid-password" },
    dependencies,
  );

  assert.equal(result.status, 500);
  assert.equal(calls.signOut, 1);
});
