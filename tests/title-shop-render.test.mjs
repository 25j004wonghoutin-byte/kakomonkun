import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
let view = {};
try { view = await import("../src/app/titles/title-shop-parts.tsx"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const item = (overrides = {}) => ({ id: "title", key: "v1-002", name: "ランダム名人", pricePoints: 0, conditionText: "同じ日に50問連続正解する", owned: false, state: "locked", implemented: true, ...overrides });
function card(title, totalPoints = 0) { assert.equal(typeof view.TitleShopCard, "function"); return renderToStaticMarkup(React.createElement(view.TitleShopCard, { title, totalPoints, onSelect() {} })); }
function dialog(title, kind) { assert.equal(typeof view.TitleShopDialog, "function"); return renderToStaticMarkup(React.createElement(view.TitleShopDialog, { title, kind, totalPoints: 10, submitting: false, error: "", onClose() {}, onPurchase() {} })); }
test("unmet condition is a clickable button with visible status", () => {
  const html = card(item()); assert.match(html, /購入条件未達成/); assert.doesNotMatch(html, /<button\b[^>]*\sdisabled(?:=|\s|>)/);
});
test("condition dialog explains eligibility without a point payment summary", () => {
  const html = dialog(item(), "condition"); assert.match(html, /購入条件/); assert.match(html, /50問連続/); assert.doesNotMatch(html, /使用するポイント/); assert.doesNotMatch(html, /購入後のポイント/);
});
test("free purchase confirmation shows zero cost and unchanged equipment notice", () => {
  const html = dialog(item({ state: "available" }), "purchase"); assert.match(html, /称号の購入確認/); assert.match(html, /0 pt/); assert.match(html, /自動で装備されません/); assert.match(html, /購入する/);
});
test("insufficient paid title displays ポイント不足 and cannot be purchased", () => {
  const html = card(item({ state: "available", pricePoints: 100, conditionText: null }), 99); assert.match(html, /ポイント不足/); assert.match(html, /<button\b[^>]*\sdisabled(?:=|\s|>)/);
});
test("owned condition title displays owned instead of unmet condition", () => {
  const html = card(item({ owned: true, state: "owned" })); assert.match(html, /所持済み/); assert.doesNotMatch(html, /購入条件未達成/);
});
