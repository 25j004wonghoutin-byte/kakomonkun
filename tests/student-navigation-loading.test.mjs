import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { StudentPageLoading } from "../src/components/student-page-loading.tsx";
import { StudentShell } from "../src/components/student-shell.tsx";

const renderAt = (pathname, element) => renderToStaticMarkup(
  createElement(PathnameContext.Provider, { value: pathname }, element),
);

test("student loading frame identifies the destination without presenting personal data", () => {
  const html = renderAt("/titles", createElement(StudentPageLoading, { title: "称号ショップ" }));
  assert.match(html, /role="status" aria-label="称号ショップを読み込み中" aria-busy="true"/);
  assert.match(html, /<h1[^>]*>称号ショップ<\/h1>/);
  assert.match(html.match(/<a[^>]*href="\/titles"[^>]*>/)?.[0] ?? "", /aria-current="page"/);
  assert.match(html, /href="\/practice"/);
  assert.match(html, /ユーザー情報を読み込み中/);
  assert.doesNotMatch(html, /href="\/teacher/);
});

test("normal student shell preserves identity, main content and idle links", () => {
  const html = renderAt("/practice", createElement(StudentShell, {
    userName: "確認用の学生", avatarUrl: null,
  }, createElement("p", null, "学習内容")));
  assert.match(html, /確認用の学生/);
  assert.match(html, /<p>学習内容<\/p>/);
  assert.match(html.match(/<a[^>]*href="\/practice"[^>]*>/)?.[0] ?? "", /aria-current="page"/);
  assert.equal((html.match(/data-navigation-pending="false"/g) ?? []).length, 9);
  assert.doesNotMatch(html, /へ移動中/);
});
