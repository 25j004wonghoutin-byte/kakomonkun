import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("teacher shell exposes only approved navigation", () => {
  const teacher = readFileSync("src/components/teacher-shell.tsx", "utf8");
  const shared = readFileSync("src/components/role-shell.tsx", "utf8");
  const source = `${teacher}\n${shared}`;

  for (const text of [
    "教師ホーム",
    "学習状況",
    "掲示板",
    "通知",
    "ログアウト",
    "管理者",
  ]) {
    assert.match(source, new RegExp(text));
  }

  assert.doesNotMatch(source, /マイページ|称号ショップ|ランキング/);
});

test("student home redirects teachers before rendering student APIs", () => {
  const source = readFileSync("src/app/page.tsx", "utf8");

  assert.match(source, /getCurrentUser/);
  assert.match(source, /role\.name === "teacher"/);
  assert.match(source, /redirect\("\/teacher"\)/);
  assert.match(source, /<StudentHome/);
});

test("teacher login has a valid role-protected landing page", () => {
  const source = readFileSync("src/app/teacher/page.tsx", "utf8");

  assert.match(source, /requireTeacherPageUser/);
  assert.match(source, /<TeacherShell/);
  assert.match(source, /教師ホーム/);
});

test("student login keeps a development-only test-student entry", () => {
  const page = readFileSync("src/app/login/page.tsx", "utf8");
  const form = readFileSync("src/components/test-student-login-form.tsx", "utf8");

  assert.match(page, /NODE_ENV/);
  assert.match(page, /TestStudentLoginForm/);
  assert.match(form, /test-student-login/);
  assert.match(form, /test-student/);
});
