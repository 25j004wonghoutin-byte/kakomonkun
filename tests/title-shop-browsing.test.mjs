import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as shop from "../src/lib/titles/shop.ts";
import * as view from "../src/app/titles/title-shop-parts.tsx";
import { readJsonResponse } from "../src/lib/read-json-response.ts";

const title = (id, pricePoints, state, owned = false, implemented = true) => ({
  id, key: id, name: `検証称号-${id}`, pricePoints, state, owned, implemented,
  conditionText: state === "locked" ? "学習条件" : null,
});
const titles = [
  title("starter", 0, "starter", true), title("paid-a", 100, "available"),
  title("free", 0, "available"), title("locked", 0, "locked"),
  title("expensive", 300, "insufficient"), title("owned", 50, "owned", true),
  title("ranking", 0, "locked", false, false), title("paid-b", 100, "available"),
  title("unowned-starter", 0, "starter"),
];
function select(items = titles, points = 100, filter = "all", sort = "default") {
  assert.equal(typeof shop.selectTitleShopItems, "function");
  return shop.selectTitleShopItems(items, points, filter, sort);
}
const ids = (items) => items.map((item) => item.id);

// Confusing the four states would either hide purchasable titles or offer invalid purchases.
for (const [filter, expected] of [
  ["all", ["starter", "paid-a", "free", "locked", "expensive", "owned", "ranking", "paid-b", "unowned-starter"]],
  ["available", ["paid-a", "free", "paid-b"]],
  ["owned", ["starter", "owned"]],
  ["locked", ["locked", "ranking"]],
  ["insufficient", ["expensive"]],
]) {
  test(`${filter} filter respects ownership, eligibility and the available point balance`, () => {
    assert.deepEqual(ids(select(titles, 100, filter)), expected);
  });
}

test("point sorting is numeric, preserves equal-price order and leaves input unchanged", () => {
  const immutable = Object.freeze(titles.map((item) => Object.freeze({ ...item })));
  assert.deepEqual(ids(select(immutable, 100, "all", "price-asc")),
    ["starter", "free", "locked", "ranking", "unowned-starter", "owned", "paid-a", "paid-b", "expensive"]);
  assert.deepEqual(ids(select(immutable, 100, "all", "price-desc")),
    ["expensive", "paid-a", "paid-b", "owned", "starter", "free", "locked", "ranking", "unowned-starter"]);
  assert.deepEqual(ids(select(immutable)), ["starter", "paid-a", "free", "locked", "expensive", "owned", "ranking", "paid-b", "unowned-starter"]);
});

test("filters use the current point balance rather than stale server purchase states", () => {
  assert.deepEqual(ids(select(titles, 0, "available")), ["free"]);
  assert.deepEqual(ids(select(titles, 0, "insufficient")), ["paid-a", "expensive", "paid-b"]);
  assert.deepEqual(ids(select(titles, 500, "available")), ["paid-a", "free", "expensive", "paid-b"]);
});

test("a newly owned title leaves the available filter and joins the owned filter", () => {
  const purchased = titles.map((item) => item.id === "paid-a" ? { ...item, owned: true, state: "owned" } : item);
  assert.deepEqual(ids(select(purchased, 0, "available")), ["free"]);
  assert.deepEqual(ids(select(purchased, 0, "owned")), ["starter", "paid-a", "owned"]);
});

test("filtering and sorting happen before the ten-card page boundary", () => {
  const many = Array.from({ length: 25 }, (_, index) => title(String(index + 1), index + 1, "available"));
  const selected = select(many, 15, "insufficient", "price-desc");
  const page = shop.paginateTitleShop(selected, 1);
  assert.equal(page.pageCount, 1);
  assert.deepEqual(ids(page.items), ["25", "24", "23", "22", "21", "20", "19", "18", "17", "16"]);
  assert.deepEqual(select([], 0, "available", "price-asc"), []);
});

// Run the real handlers with hook scheduling substituted, not a second implementation of the UI.
function mountList(initialTitles = titles, initialPoints = 100) {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("../src/app/titles/title-shop-parts.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const values = [];
  let stateIndex = 0, currentTitles = initialTitles, totalPoints = initialPoints;
  const hooks = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }];
    },
    useRef: () => ({ current: null }), useId: () => "fixture",
  };
  const exports = {};
  vm.runInNewContext(outputText, { exports, requestAnimationFrame: (callback) => callback(), require(id) {
    if (id === "react") return hooks;
    if (id === "@/lib/titles/shop") return shop;
    return require(id);
  } });
  const ui = {
    tree: null,
    render() { stateIndex = 0; this.tree = exports.TitleShopList({ titles: currentTitles, totalPoints, onSelect() {} }); return this; },
    nodes(predicate) {
      const found = [];
      const visit = (node) => { if (!React.isValidElement(node)) return; if (predicate(node)) found.push(node); React.Children.forEach(node.props.children, visit); };
      visit(this.tree);
      return found;
    },
    change(name, value) {
      const control = this.nodes((node) => node.type === "select" && node.props.name === name)[0];
      assert.ok(control, `missing ${name} control`);
      control.props.onChange({ target: { value } });
      return this.render();
    },
    page(number) { this.nodes((node) => node.props.role === "tab" && node.props["aria-label"] === `${number}ページ目`)[0].props.onClick(); return this.render(); },
    update(items, points) { currentTitles = items; totalPoints = points; return this.render(); },
    cards() { return this.nodes((node) => node.type === exports.TitleShopCard).map((node) => node.props.title.id); },
    html() { return renderToStaticMarkup(this.tree); },
  };
  return ui.render();
}

test("the rendered list offers labelled controls and combines filtering with price order", () => {
  const ui = mountList();
  assert.match(ui.html(), /並び順/);
  assert.match(ui.html(), /フィルター/);
  ui.change("filter", "available").change("sort", "price-asc");
  assert.deepEqual(ui.cards(), ["free", "paid-a", "paid-b"]);
  ui.change("sort", "price-desc");
  assert.deepEqual(ui.cards(), ["paid-a", "paid-b", "free"]);
  ui.change("filter", "all").change("sort", "default");
  assert.deepEqual(ui.cards(), ["starter", "paid-a", "free", "locked", "expensive", "owned", "ranking", "paid-b", "unowned-starter"]);
});

test("changing either control resets a later page to the first result page", () => {
  const many = Array.from({ length: 25 }, (_, index) => title(String(index + 1), index + 1, "available"));
  const ui = mountList(many, 25).page(3).change("sort", "price-desc");
  assert.deepEqual(ui.cards(), ["25", "24", "23", "22", "21", "20", "19", "18", "17", "16"]);
  ui.page(2).change("filter", "available");
  assert.deepEqual(ui.cards(), ["25", "24", "23", "22", "21", "20", "19", "18", "17", "16"]);
});

test("no matching titles show an empty message without redundant page tabs", () => {
  const ui = mountList([title("only-owned", 0, "owned", true)]).change("filter", "available");
  assert.deepEqual(ui.cards(), []);
  assert.match(ui.html(), /該当する称号はありません/);
  assert.doesNotMatch(ui.html(), /role="tab"/);
});

test("the list re-evaluates active filters when a purchase updates its props", () => {
  const ui = mountList().change("filter", "available");
  const purchased = titles.map((item) => item.id === "paid-a" ? { ...item, owned: true, state: "owned" } : item);
  ui.update(purchased, 0);
  assert.deepEqual(ui.cards(), ["free"]);
  ui.change("filter", "insufficient");
  assert.deepEqual(ui.cards(), ["expensive", "paid-b"]);
});

// A filter can unmount the purchased card before the existing focus-restoration frame runs.
for (const connected of [true, false]) {
  test(`purchase restores focus to ${connected ? "the remaining card" : "the list when the card disappears"}`, async () => {
    const require = createRequire(import.meta.url);
    const source = readFileSync(new URL("../src/app/titles/title-shop.tsx", import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    const document = { activeElement: null };
    const card = { isConnected: connected, focus() { if (this.isConnected) document.activeElement = this; } };
    const fallback = { focus() { document.activeElement = this; } };
    const opener = { closest: () => card };
    const refs = [{ current: null }, { current: null }, { current: opener }, { current: fallback }];
    const state = [null, { title: titles[1], kind: "purchase" }, false, "", ""];
    let stateIndex = 0, refIndex = 0;
    const frames = [];
    const exports = {};
    vm.runInNewContext(outputText, { exports, document, requestAnimationFrame: (callback) => frames.push(callback),
      fetch: async () => new Response(JSON.stringify({ title: { id: "paid-a", name: titles[1].name }, totalPoints: 0 })),
      require(id) {
        if (id === "react") return {
          useState: () => [state[stateIndex++], () => {}], useRef: () => refs[refIndex++], useEffect() {},
        };
        if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
        if (id === "next/link") return { default: () => null };
        if (id === "@/components/student-shell") return {};
        if (id === "@/components/ui") return {};
        if (id === "@/lib/read-json-response") return { readJsonResponse };
        if (id === "@/lib/titles/shop") return shop;
        if (id === "./title-shop-parts") return view;
        return require(id);
      },
    });
    const tree = exports.TitleShop({ initialData: { displayName: "検証学生", totalPoints: 100, currentTitle: null, titles } });
    let dialog;
    const visit = (node) => { if (!React.isValidElement(node)) return; if (node.type === view.TitleShopDialog) dialog = node; React.Children.forEach(node.props.children, visit); };
    visit(tree);
    assert.ok(dialog);
    await dialog.props.onPurchase();
    for (const callback of frames) callback();
    assert.equal(document.activeElement, connected ? card : fallback);
  });
}
