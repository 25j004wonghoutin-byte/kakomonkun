import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  isStudentId,
  parseTeacherStudentDetailQuery,
} from "../src/lib/teacher/student-detail.ts";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveTeacherDetailImport(request, ...args) {
  const target = request.startsWith("@/")
    ? fileURLToPath(new URL(`../src/${request.slice(2)}`, import.meta.url))
    : request;
  return originalResolveFilename.call(this, target, ...args);
};

function loadTypeScript(module, filename) {
  const source = readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(code, filename);
}

Module._extensions[".tsx"] = loadTypeScript;
Module._extensions[".ts"] = loadTypeScript;

test("student detail query accepts only two tabs and positive pages", () => {
  assert.deepEqual(
    parseTeacherStudentDetailQuery({ tab: "daily", page: "2" }),
    { tab: "daily", page: 2 },
  );
  assert.deepEqual(
    parseTeacherStudentDetailQuery({ tab: "unknown", page: "-1" }),
    { tab: "practice", page: 1 },
  );
  assert.equal(isStudentId("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isStudentId("not-a-uuid"), false);
});

const baseDetail = {
  student: {
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "あおい",
    bio: "毎日少しずつ学習しています。",
    totalPoints: 1480,
    latestLearningAt: "2026-09-19T05:32:00.000Z",
  },
  summary: { answerCount: 284, correctCount: 233, accuracy: 82 },
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

test("practice detail renders read-only summary and practice history", () => {
  const { StudentLearningDetail } = require(
    "../src/app/teacher/students/[userId]/student-learning-detail.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(StudentLearningDetail, {
      data: {
        ...baseDetail,
        tab: "practice",
        practiceHistory: [
          {
            id: "practice-1",
            completedAt: "2026-09-19T05:32:00.000Z",
            examName: "ITパスポート試験",
            questionCount: 30,
            correctCount: 25,
            accuracy: 83,
            earnedPoints: 50,
          },
        ],
        dailyHistory: [],
      },
    }),
  );

  assert.match(html, /あおい/);
  assert.match(html, /毎日少しずつ学習しています。/);
  assert.match(html, /1,480/);
  assert.match(html, /ITパスポート試験/);
  assert.match(html, /25問/);
  assert.doesNotMatch(html, /編集|変更|保存/);
});

test("daily detail renders the question, selected choice and result", () => {
  const { StudentLearningDetail } = require(
    "../src/app/teacher/students/[userId]/student-learning-detail.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(StudentLearningDetail, {
      data: {
        ...baseDetail,
        tab: "daily",
        practiceHistory: [],
        dailyHistory: [
          {
            id: "daily-1",
            answerDate: "2026-09-18T00:00:00.000Z",
            answeredAt: "2026-09-18T01:00:00.000Z",
            examCode: "IP",
            examName: "ITパスポート試験",
            sourceYear: 2026,
            sourceSeason: "公開問題",
            questionNo: 12,
            questionText: "情報セキュリティの目的はどれか。",
            selectedChoiceLabel: "イ",
            selectedChoiceText: "機密性を守る",
            isCorrect: true,
          },
        ],
      },
    }),
  );

  assert.match(html, /情報セキュリティの目的はどれか。/);
  assert.match(html, /イ/);
  assert.match(html, /機密性を守る/);
  assert.match(html, /正解/);
});
