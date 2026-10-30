import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {PathnameContext} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import {StudentShell} from "../src/components/student-shell.tsx";

const render = props => renderToStaticMarkup(createElement(PathnameContext.Provider, {value:"/practice"},
  createElement(StudentShell, props, createElement("p", null, "学習内容"))));

test("a page-provided student identity appears in the header", () => {
 const html=render({identity:{id:"current-student",displayName:"現在の学生",avatarUrl:null}});
 assert.match(html,/現在の学生/);
 assert.match(html,/<p>学習内容<\/p>/);
 assert.doesNotMatch(html,/ユーザー情報を読み込み中/);
});

test("an externally loading identity does not expose legacy or previous identity", () => {
 const html=render({identity:null,userName:"前の利用者",avatarUrl:"/old-avatar.png"});
 assert.doesNotMatch(html,/前の利用者|old-avatar/);
 assert.match(html,/ユーザー情報を読み込み中/);
});
