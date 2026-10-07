import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === "next/navigation" ? "next/navigation.js" : specifier, context);
} });
const { TestStudentLoginForm } = await import("../src/components/test-student-login-form.tsx");

test("development login renders distinct controls for both test students", () => {
  const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: {} }, React.createElement(TestStudentLoginForm, { nextPath: "/" })));
  assert.match(html, /test-studentでログイン/);
  assert.match(html, /test-student2でログイン/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
});
