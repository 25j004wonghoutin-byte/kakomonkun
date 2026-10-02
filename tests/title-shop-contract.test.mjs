import assert from "node:assert/strict";
import test from "node:test";
let shop = {};
try { shop = await import("../src/lib/titles/shop.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const row = (key, overrides = {}) => ({ id: key, catalogKey: key, name: "称号", pricePoints: 0, acquisitionKind: "condition", isActive: true, userTitles: [], userTitleUnlocks: [], ...overrides });
function items(rows, points = 0) { assert.equal(typeof shop.toTitleShopItems, "function"); return shop.toTitleShopItems(rows, points); }
test("locked title click selects condition details, not a purchase", () => {
  const [item] = items([row("v1-002")]); assert.equal(item.state, "locked"); assert.equal(shop.titleShopAction(item, 0), "condition"); assert.match(item.conditionText, /50問/);
});
test("free eligible title still selects purchase confirmation", () => {
  const [item] = items([row("v1-002", { userTitleUnlocks: [{ titleId: "v1-002" }] })]); assert.equal(item.state, "available"); assert.equal(shop.titleShopAction(item, 0), "purchase");
});
test("existing owned titles precede unmet eligibility and disabled ranking", () => {
  const [item] = items([row("v1-009", { userTitles: [{ id: "owned" }] })]); assert.equal(item.state, "owned"); assert.equal(shop.titleShopAction(item, 0), "none");
});
test("paid titles dynamically become insufficient after spending points", () => {
  const [item] = items([row("v1-049", { pricePoints: 2, acquisitionKind: "points" })], 2); assert.equal(item.state, "available"); assert.equal(shop.titleShopAction(item, 1), "none");
});
test("future ranking remains locked even if an unrelated unlock record exists", () => {
  const [item] = items([row("v1-009", { userTitleUnlocks: [{ titleId: "v1-009" }] })]); assert.equal(item.state, "locked"); assert.equal(item.implemented, false); assert.match(item.conditionText, /未実装/);
});
test("starter remains visible and legacy-only rows are not offered for new sales", () => {
  const result = items([row("v1-014", { acquisitionKind: "starter", userTitles: [{ id: "owned" }] }), row(null, { id: "legacy", name: "旧称号", acquisitionKind: null, userTitles: [{ id: "owned" }] })]);
  assert.equal(result.length, 1); assert.equal(result[0].state, "starter"); assert.equal(result[0].owned, true);
});
