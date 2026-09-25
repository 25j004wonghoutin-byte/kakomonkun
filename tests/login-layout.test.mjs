import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("login layout keeps the approved 3:7 split without mascot", () => {
  const layout = readFileSync("src/components/login-layout.tsx", "utf8");
  const logo = readFileSync("public/brand-login.svg", "utf8");
  assert.match(layout, /lg:grid-cols-\[3fr_7fr\]/);
  assert.match(layout, /brand-login\.svg/);
  assert.match(layout, /loading="eager"/);
  assert.doesNotMatch(layout + logo, /mascot|キャラクター|管理者専用/i);
});

test("teacher form has aligned fields button and switch link", () => {
  const form = readFileSync("src/components/teacher-login-form.tsx", "utf8");
  assert.match(form, /max-w-\[430px\]/);
  assert.match(form, /学生ログインへ戻る/);
  assert.match(form, /signInWithPassword/);
  assert.match(form, /test-teacher-login/);
});
