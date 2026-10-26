import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeStudyTotals } from "../src/components/home-study-totals.tsx";
const profile = { totalPoints: 10, avatarUrl: null, totalPracticeCount: 2, totalCorrectCount: 3, totalAnswerCount: 4, ownedTitleCount: 4 };
const render = (props = {}) => renderToStaticMarkup(React.createElement(HomeStudyTotals, { profile: null, loading: false, error: "", onRetry() {}, ...props }));
test("missing and failed counts are not zero", () => {
  for (const props of [{ loading: true }, { error: "読み込めませんでした。" }]) {
    const html = render(props); assert.match(html, /— 個/); assert.doesNotMatch(html, /0 個/);
  }
  assert.match(render({ error: "読み込めませんでした。" }), /再試行/);
});
test("zero is a real count", () => { assert.match(render({ profile: { ...profile, ownedTitleCount: 0 } }), /0 個/); });
test("current study totals keep existing facts and add ownership", () => {
  const html = render({ profile });
  for (const value of ["これまでの学習", "所持ポイント", "10 pt", "回答数", "4 問", "75%", "2 回", "所持称号", "4 個"]) assert.ok(html.includes(value), value);
  assert.match(html, /<dl>/); assert.equal((html.match(/class="study-stat"/g) ?? []).length, 5);
});
