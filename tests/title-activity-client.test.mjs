import assert from "node:assert/strict";
import test from "node:test";
let clientModule = {};
try { clientModule = await import("../src/lib/titles/activity-client.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
function fixture() {
  assert.equal(typeof clientModule.createTitleActivityClient, "function");
  const saved = new Map(), sent = []; let visible = true, date = "2026-10-02", fail = false;
  const storage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const options = { storage, uuid: () => "tab", isVisible: () => visible, date: () => date, send: async (body) => { sent.push(structuredClone(body)); if (fail) throw Error("offline"); return { date }; } };
  const client = clientModule.createTitleActivityClient(options);
  return { client, sent, options, setVisible: (v) => visible = v, setDate: (d) => date = d, setFail: (v) => fail = v };
}
test("StrictMode duplicate display sends one navigation ID", async () => {
  const f = fixture(); await Promise.all([f.client.visit("/", true), f.client.visit("/", true)]);
  assert.equal(f.sent.length, 1); assert.deepEqual(f.sent[0], { navigation: { tabId: "tab", sequence: 1, path: "/" } });
});
test("hidden visits and inputs emit no usage", async () => {
  const f = fixture(); f.setVisible(false); await f.client.visit("/"); await f.client.input("/"); assert.equal(f.sent.length, 0);
  f.setVisible(true); await f.client.visit("/", true); assert.equal(f.sent.length, 1);
});
test("actual input after JST date change records a day but not a navigation", async () => {
  const f = fixture(); await f.client.visit("/"); await f.client.input("/"); assert.equal(f.sent.length, 1);
  f.setDate("2026-10-03"); await f.client.input("/"); assert.equal(f.sent.length, 2); assert.deepEqual(f.sent[1], {});
});
test("reload retains tab and sequence without adding a same-path visit", async () => {
  const f = fixture(); await f.client.visit("/"); await f.client.visit("/profile");
  const reloaded = clientModule.createTitleActivityClient(f.options); await reloaded.visit("/profile", true); await reloaded.visit("/");
  assert.deepEqual(f.sent.map((row) => row.navigation?.sequence ?? null), [1, 2, null, 3]);
});
test("failed retry uses identical sequence and path", async () => {
  const f = fixture(); f.setFail(true); await f.client.visit("/"); f.setFail(false); await f.client.visit("/");
  assert.deepEqual(f.sent[0], f.sent[1]); assert.equal(f.sent[1].navigation.sequence, 1);
});
