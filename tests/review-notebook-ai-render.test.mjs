import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
const imageModule = import.meta.resolve("next/image.js");
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "next/image") return { url: "data:text/javascript," + encodeURIComponent("import Image from " + JSON.stringify(imageModule) + "; export default Image.default ?? Image;"), shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { ReviewQuestionView } = await import("../src/app/review-notebook/[itemId]/review-question-view.tsx");
const detail = { id: "item", status: "unreviewed", revision: 1, questionVersion: "a".repeat(64), lastWrongAt: "2026-10-26T00:00:00Z", lastReviewedAt: null, question: { id: "q", text: "検証問題", imagePath: "/question.png", displayMode: "official_scan", source: { label: "公開問題 問1", url: "https://example.com/source" }, exam: { code: "it_passport", name: "ITパスポート" }, category: { code: "technology", name: "テクノロジ" }, choices: [{ id: "a", label: "ア", text: "選択肢ア" }] } };
const result = { item: { id: "item", status: "reviewed", revision: 2, lastReviewedAt: "2026-10-26T01:00:00Z" }, answer: { selectedChoiceId: "a", isCorrect: true, explanation: null, correctChoice: { id: "a", label: "ア", text: "選択肢ア" } }, replayed: false };
const emptyAi = { loading: false, error: "", result: null, requiresReload: false, requiresLogin: false, unavailable: false };
const render = props => renderToStaticMarkup(React.createElement(ReviewQuestionView, { detail, result, ai: emptyAi, selectedChoiceId: "a", saving: false, error: "", requiresReload: false, requiresLogin: false, unavailable: false, onSelect() {}, onSubmit() {}, onRetry() {}, onReload() {}, onReset() {}, onRequestAi() {}, backHref: "/review-notebook", ...props }));
test("saved answer exposes an explicit AI button while unsaved answers never do", () => {
  assert.match(render(), /AI解説を見る/); assert.doesNotMatch(render({ result: null }), /AI解説/);
  const html = render({ ai: { ...emptyAi, loading: true } }); assert.match(html, /AI解説を生成しています/); assert.match(html, /disabled=""/); assert.match(html, /role="status"/);
});
test("AI markdown keeps official images sources and unchanged review notice", () => {
  const html = render({ ai: { ...emptyAi, result: { explanation: "## 図の読み方\n**重要**な説明", fromCache: true } } });
  assert.match(html, /<h4[^>]*>図の読み方<\/h4>/); assert.match(html, /<strong[^>]*>重要<\/strong>/); assert.match(html, /question.png/); assert.match(html, /公開問題 問1/); assert.match(html, /復習はポイントや通常の成績に加算されません/);
});
test("AI failure offers retry and stale data offers reload without old content", () => {
  assert.match(render({ ai: { ...emptyAi, error: "AI解説を取得できませんでした。再試行してください。" } }), /AI解説を再試行/);
  const stale = render({ ai: { ...emptyAi, requiresReload: true, error: "再読み込みしてください。" } }); assert.match(stale, /再読み込み/); assert.doesNotMatch(stale, /AI解説を見る/);
});
test("AI authentication or unavailable failures hide the previous private question", () => {
  for (const flags of [{ requiresLogin: true }, { unavailable: true }]) assert.doesNotMatch(render({ ai: { ...emptyAi, ...flags } }), /question.png|検証問題|選択肢ア|AI解説/);
});
