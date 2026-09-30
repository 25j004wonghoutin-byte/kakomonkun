import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayNameForRole,
  isTeacherRole,
  isTeacherSessionPayload,
  normalizeTeacherAccountName,
  teacherAuthEmailForAccount,
} from "../src/lib/teacher/identity.ts";

test("teacher identity is fixed and student identity is preserved", () => {
  assert.equal(displayNameForRole("teacher", "別名"), "管理者");
  assert.equal(displayNameForRole("student", "あおい"), "あおい");
  assert.equal(isTeacherRole("teacher"), true);
  assert.equal(isTeacherRole("student"), false);
});

test("teacher account name is normalized and mapped to an internal email", () => {
  assert.equal(normalizeTeacherAccountName(" Teacher.Admin "), "teacher.admin");
  assert.equal(
    teacherAuthEmailForAccount(" Teacher.Admin "),
    "teacher.admin@teacher.local",
  );
});

test("teacher account name rejects email addresses and unsupported characters", () => {
  assert.equal(normalizeTeacherAccountName("teacher@example.com"), null);
  assert.equal(normalizeTeacherAccountName("teacher account"), null);
  assert.equal(normalizeTeacherAccountName("管理者"), null);
  assert.equal(normalizeTeacherAccountName("ab"), null);
  assert.equal(teacherAuthEmailForAccount("invalid@example.com"), null);
});

test("teacher session payload rejects authenticated non-teachers", () => {
  assert.equal(
    isTeacherSessionPayload({ role: "teacher", displayName: "管理者" }),
    true,
  );
  assert.equal(
    isTeacherSessionPayload({ role: "student", displayName: "あおい" }),
    false,
  );
  assert.equal(isTeacherSessionPayload({ error: "unauthorized" }), false);
});
