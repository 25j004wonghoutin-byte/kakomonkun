import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { StudentShell } from "../src/components/student-shell.tsx";
test("student navigation puts review below practice and nested detail stays selected", () => {
  const html = renderToStaticMarkup(React.createElement(PathnameContext.Provider, { value: "/review-notebook/item" }, React.createElement(StudentShell, { userName: "検証学生", avatarUrl: null }, "content")));
  assert.ok(html.indexOf("過去問練習") < html.indexOf("復習ノート")); assert.ok(html.indexOf("復習ノート") < html.indexOf("模擬試験"));
  assert.match(html, /<a[^>]*aria-current="page"[^>]*href="\/review-notebook"|<a[^>]*href="\/review-notebook"[^>]*aria-current="page"/);
});
