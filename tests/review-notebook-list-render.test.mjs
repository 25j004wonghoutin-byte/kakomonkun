import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewNotebookListView } from "../src/app/review-notebook/review-notebook-view.tsx";
const query = { status: "unfinished", examCode: null, categoryCode: null, sessionId: null, page: 1 };
const items = Array.from({ length: 10 }, (_, i) => ({ id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`, status: i % 2 ? "reviewing" : "unreviewed", firstWrongAt: "2026-10-26T00:00:00Z", lastWrongAt: "2026-10-26T00:00:00Z", lastReviewedAt: null, exam: { code: "it_passport", name: "ITパスポート" }, category: { code: "technology", name: "テクノロジ" }, sourceLabel: "2024年度 公開問題 問1", questionPreview: i ? "長い日本語の問題".repeat(8) : "画像問題" }));
const data = { query, items, total: 11, pageCount: 2, pageSize: 10 };
const render = props => renderToStaticMarkup(React.createElement(ReviewNotebookListView, { data, query, loading: false, error: null, onQueryChange() {}, onRetry() {}, ...props }));
test("renders ten rows and all filters", () => {
  const html = render(); assert.equal((html.match(/data-review-item=/g) ?? []).length, 10);
  for (const value of ["復習ノート", "未完了", "復習済み", "すべて", "試験", "分野", "解き直す", "次のページ", "未復習", "復習中"]) assert.ok(html.includes(value), value);
  assert.match(html, /画像問題/); assert.match(html, /長い日本語/); assert.match(html, /aria-current="page"/);
});
test("empty and failure are distinct and 401 hides private rows", () => {
  const empty = render({ data: { ...data, total: 0, items: [] } }); assert.match(empty, /過去問練習で間違えた問題がここに保存されます/);
  const error = render({ error: { status: 0, message: "取得できませんでした。" } }); assert.doesNotMatch(error, /data-review-item=|ここに保存されます/); assert.match(error, /再試行/);
  const loggedOut = render({ error: { status: 401, message: "ログインしてください。" } }); assert.doesNotMatch(loggedOut, /長い日本語/); assert.match(loggedOut, /href="\/login"/);
});
test("session scope can be removed without losing the selected filters", () => {
  const html = render({ query: { ...query, status: "all", sessionId: "11111111-1111-4111-8111-111111111111" } });
  assert.match(html, /今回の練習のみ/); assert.match(html, /絞り込みを解除/);
});
