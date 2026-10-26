import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
const imageModule = import.meta.resolve("next/image.js");
// Next's bundler unwraps this CJS default; keep the real Image in Node SSR too.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "next/image") return { url: `data:text/javascript,${encodeURIComponent(`import Image from ${JSON.stringify(imageModule)}; export default Image.default ?? Image;`)}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { ReviewQuestionView } = await import("../src/app/review-notebook/[itemId]/review-question-view.tsx");
const detail = { id: "item", status: "unreviewed", revision: 1, questionVersion: "a".repeat(64), lastWrongAt: "2026-10-26T00:00:00Z", lastReviewedAt: null, question: { id: "q", text: "検証問題", imagePath: "/question.png", displayMode: "standard", source: { label: "公開問題 問1", url: "https://example.com/source" }, exam: { code: "it_passport", name: "ITパスポート" }, category: { code: "technology", name: "テクノロジ" }, choices: [{ id: "a", label: "ア", text: "選択肢ア" }, { id: "b", label: "イ", text: "選択肢イ" }] } };
const result = { item: { id: "item", status: "reviewed", revision: 2, lastReviewedAt: "2026-10-26T01:00:00Z" }, answer: { selectedChoiceId: "a", isCorrect: true, explanation: null, correctChoice: { id: "a", label: "ア", text: "選択肢ア" } }, replayed: false };
const render = props => renderToStaticMarkup(React.createElement(ReviewQuestionView, { detail, selectedChoiceId: null, result: null, saving: false, error: "", requiresReload: false, requiresLogin: false, unavailable: false, onSelect() {}, onSubmit() {}, onRetry() {}, onReload() {}, onReset() {}, backHref: "/review-notebook?status=all", ...props }));
test("question hides grading before save and keeps images source and no reward notice", () => {
  const html = render(); assert.match(html, /検証問題/); assert.match(html, /question.png/); assert.match(html, /公開問題 問1/); assert.match(html, /復習はポイントや通常の成績に加算されません/);
  assert.doesNotMatch(html, /正解：|解説は未登録です|AI解説/);
});
test("only saved result reveals grading and missing explanation with fresh-attempt action", () => {
  const html = render({ result, selectedChoiceId: "a" }); assert.match(html, /正解/); assert.match(html, /解説は未登録です/); assert.match(html, /もう一度解く/); assert.match(html, /一覧へ戻る/);
});
test("login and unavailable states hide previous private question", () => {
  for (const props of [{ requiresLogin: true }, { unavailable: true }]) { const html = render({ ...props, result }); assert.doesNotMatch(html, /検証問題|選択肢ア|question.png/); }
});
