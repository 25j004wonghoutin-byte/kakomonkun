import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as shop from "../src/lib/titles/shop.ts";
import * as view from "../src/app/titles/title-shop-parts.tsx";

const titles = Array.from({ length: 66 }, (_, index) => ({
  id: String(index + 1), key: `fixture-${index + 1}`, name: `検証称号${index + 1}`,
  pricePoints: 0, conditionText: "学習条件", owned: index === 7,
  state: index === 7 ? "owned" : "locked", implemented: true,
}));
function paginate(items, page) {
  assert.equal(typeof shop.paginateTitleShop, "function");
  return shop.paginateTitleShop(items, page);
}
function render(items) {
  assert.equal(typeof view.TitleShopList, "function");
  return renderToStaticMarkup(React.createElement(view.TitleShopList, { titles: items, totalPoints: 9, onSelect() {} }));
}

// A missing slice, off-by-one boundary, reordered titles or blank last page must fail.
test("66 titles start with ten cards in their existing order and seven pages", () => {
  const page = paginate(titles, 1);
  assert.equal(page.page, 1);
  assert.equal(page.pageCount, 7);
  assert.deepEqual(page.items.map((title) => title.id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  assert.equal(page.items[7], titles[7]);
  assert.equal(page.items[7].owned, true);
});

test("the second page neither repeats nor skips the eleventh title", () => {
  const page = paginate(titles, 2);
  assert.deepEqual(page.items.map((title) => title.id), ["11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]);
});

test("the final page contains the six remaining titles without mutating the source", () => {
  const originalIds = titles.map((title) => title.id);
  const page = paginate(titles, 7);
  assert.deepEqual(page.items.map((title) => title.id), ["61", "62", "63", "64", "65", "66"]);
  assert.deepEqual(titles.map((title) => title.id), originalIds);
});

test("out-of-range pages clamp to existing content rather than displaying a blank list", () => {
  assert.equal(paginate(titles, 0).page, 1);
  assert.equal(paginate(titles, 99).page, 7);
  assert.equal(paginate(titles.slice(0, 10), 7).page, 1);
  assert.equal(paginate(titles.slice(0, 10), 1).pageCount, 1);
  assert.deepEqual(paginate([], 1), { items: [], page: 1, pageCount: 1 });
});

test("the rendered first page has seven accessible page tabs and exactly ten cards", () => {
  const html = render(titles);
  assert.equal((html.match(/<article\b/g) ?? []).length, 10);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 7);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(html, /検証称号10/);
  assert.doesNotMatch(html, /検証称号11/);
  assert.match(html, /role="tabpanel"/);
});

test("page tabs lead into a focusable panel with consistent accessible labels", () => {
  const html = render(titles);
  const panel = html.match(/<section\b[^>]*role="tabpanel"[^>]*>/)?.[0];
  assert.ok(panel);
  assert.match(panel, /tabindex="0"/);
  assert.ok(html.indexOf('role="tablist"') < html.indexOf('role="tabpanel"'));
  const panelId = panel.match(/\bid="([^"]+)"/)?.[1];
  const selectedTab = html.match(/<button\b[^>]*role="tab"[^>]*aria-selected="true"[^>]*>/)?.[0];
  const selectedTabId = selectedTab?.match(/\bid="([^"]+)"/)?.[1];
  assert.ok(panelId && selectedTabId);
  assert.ok(panel.includes(`aria-labelledby="${selectedTabId}"`));
  const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)];
  assert.equal(controls.length, 7);
  for (const control of controls) assert.equal(control[1], panelId);
});

test("a single-page or empty shop does not offer redundant page switches", () => {
  for (const items of [titles.slice(0, 10), []]) assert.doesNotMatch(render(items), /role="tablist"/);
});
