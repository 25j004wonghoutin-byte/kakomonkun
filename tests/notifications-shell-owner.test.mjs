import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
function NotificationBell() {}
function bell(path, name, props, identity, signedOut = false) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require(id) {
    if (id === "react") return { useState: value => [typeof value === "function" ? value() : value, () => {}], useEffect() {}, useRef: value => ({ current: value }) };
    if (id === "next/navigation") return { usePathname: () => "/notifications" };
    if (id === "next/link") return { default: "a" };
    if (id === "@/components/study-ui-preferences") return { useSidebarVisibility: () => [true, () => {}] };
    if (id === "@/components/student-identity-provider") return { useRememberedStudentIdentity: () => ({ identity, signedOut, store: { seed() {}, load() { throw Error("shell rendering must not fetch identity"); } } }) };
    if (id === "@/components/notification-bell") return { NotificationBell };
    if (id.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    return require(id);
  } }, { filename: path });
  const find = node => {
    if (!node || typeof node !== "object") return null;
    if (node.type === NotificationBell) return node.props;
    for (const child of [node.props?.children].flat(Infinity)) { const result = find(child); if (result) return result; }
    return null;
  };
  return find(exports[name](props));
}

test("student bell uses the refreshed identity owner while server shell props still name the old owner", () => {
  const props = bell("../src/components/student-shell.tsx", "StudentShell", { userId: "old", userName: "以前の学生", children: null }, { id: "new", displayName: "現在の学生", avatarUrl: null });
  assert.equal(props.ownerId, "new"); assert.equal(props.enabled, true);
});

test("teacher bell binds the shared live identity and falls back to its authenticated server owner", () => {
  const base = { userId: "teacher-old", userName: "管理者", avatarLabel: "管", navigation: [], children: null };
  assert.equal(bell("../src/components/role-shell.tsx", "RoleNavigationShell", base, { id: "teacher-new" }).ownerId, "teacher-new");
  assert.equal(bell("../src/components/role-shell.tsx", "RoleNavigationShell", base, null).ownerId, "teacher-old");
});

test("signed-out student and teacher shells remove notification ownership", () => {
  assert.equal(bell("../src/components/student-shell.tsx", "StudentShell", { userId: "old", userName: "以前の学生" }, null, true).ownerId, null);
  assert.equal(bell("../src/components/role-shell.tsx", "RoleNavigationShell", { userId: "old", userName: "管理者", avatarLabel: "管", navigation: [] }, null, true).ownerId, null);
});
