import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayNameForRole,
  isTeacherRole,
  isTeacherSessionPayload,
  normalizeDevTeacherAccount,
} from "../src/lib/teacher/identity.ts";

test("teacher identity is fixed and student identity is preserved", () => {
  assert.equal(displayNameForRole("teacher", "別名"), "管理者");
  assert.equal(displayNameForRole("student", "あおい"), "あおい");
  assert.equal(isTeacherRole("teacher"), true);
  assert.equal(isTeacherRole("student"), false);
});

test("development teacher accepts only test-teacher", () => {
  assert.equal(
    normalizeDevTeacherAccount(" TEST-TEACHER "),
    "test-teacher@test.local",
  );
  assert.equal(normalizeDevTeacherAccount("test-student"), null);
  assert.equal(normalizeDevTeacherAccount("teacher@example.com"), null);
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
