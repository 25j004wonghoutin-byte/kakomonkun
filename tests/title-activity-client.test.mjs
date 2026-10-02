import assert from "node:assert/strict";
import test from "node:test";
import { advanceNavigation } from "../src/lib/titles/activity.ts";
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

test("rapid navigation is delivered in order even if the profile request is delayed", async () => {
  const f = fixture(); let resolveProfile;
  const delivered = []; let nav = { lastSequence: 0, stage: "idle", roundTrips: 0 };
  f.options.send = async (body) => {
    if (body.navigation?.path === "/profile") await new Promise((resolve) => { resolveProfile = resolve; });
    delivered.push(body.navigation?.sequence);
    if (body.navigation) nav = advanceNavigation(nav, body.navigation);
    return { date: "2026-10-02" };
  };
  const client = clientModule.createTitleActivityClient(f.options);
  await client.visit("/");
  const profile = client.visit("/profile");
  await new Promise((resolve) => setImmediate(resolve));
  const home = client.visit("/");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(delivered, [1]);
  resolveProfile(); await Promise.all([profile, home]);
  assert.deepEqual(delivered, [1, 2, 3]); assert.equal(nav.roundTrips, 1);
});

test("navigation after failure retries the unacknowledged path before the next one", async () => {
  const f = fixture(); const nav = { lastSequence: 0, stage: "idle", roundTrips: 0 }; let state = nav;
  f.options.send = async (body) => { f.sent.push(structuredClone(body)); if (f.sent.length === 2) throw Error("offline"); if (body.navigation) state = advanceNavigation(state, body.navigation); return { date: "2026-10-02" }; };
  const client = clientModule.createTitleActivityClient(f.options);
  await client.visit("/"); await client.visit("/profile"); await client.visit("/");
  assert.deepEqual(f.sent.map((row) => row.navigation.sequence), [1, 2, 2, 3]); assert.equal(state.roundTrips, 1);
});

test("navigation queued exactly while an earlier acknowledgement settles is still drained", async () => {
  const f = fixture(); let client, nextVisit;
  f.options.send = async (body) => {
    f.sent.push(structuredClone(body));
    if (f.sent.length === 1) queueMicrotask(() => { nextVisit = client.visit("/profile"); });
    return { date: "2026-10-02" };
  };
  client = clientModule.createTitleActivityClient(f.options);
  await client.visit("/"); await nextVisit;
  assert.deepEqual(f.sent.map((row) => row.navigation?.sequence), [1, 2]);
});

function tabFixture() {
  const streams = new Map(), held = new Set(); let uuid = 0;
  const send = async (body) => {
    if (body.navigation) {
      const { tabId } = body.navigation;
      const before = streams.get(tabId) ?? { lastSequence: 0, stage: "idle", roundTrips: 0 };
      streams.set(tabId, advanceNavigation(before, body.navigation));
    }
    return { date: "2026-10-02" };
  };
  const claimTabId = async (id) => { if (held.has(id)) return false; held.add(id); return true; };
  const newTab = (saved = new Map()) => {
    const options = { storage: { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) }, uuid: () => `tab-${++uuid}`, isVisible: () => true, date: () => "2026-10-02", send, claimTabId };
    return { client: clientModule.createTitleActivityClient(options), saved, options };
  };
  return { newTab, streams, held, total: () => [...streams.values()].reduce((n, s) => n + s.roundTrips, 0) };
}

test("copied sessionStorage tabs complete two independent trips", async () => {
  const f = tabFixture(), a = f.newTab(); await a.client.visit("/");
  const b = f.newTab(new Map(a.saved)); await b.client.visit("/");
  await a.client.visit("/profile"); await b.client.visit("/profile"); await a.client.visit("/"); await b.client.visit("/");
  assert.equal(f.streams.size, 2); assert.equal(f.total(), 2);
});

test("copied tab state cannot combine separate invalid trips into an award", async () => {
  const f = tabFixture(), a = f.newTab(); await a.client.visit("/");
  const b = f.newTab(new Map(a.saved)); await a.client.visit("/profile");
  await b.client.visit("/board"); await b.client.visit("/profile"); await b.client.visit("/");
  assert.equal(f.streams.size, 2); assert.equal(f.total(), 0);
});

test("reload resumes partial progress once its old browsing-context claim is released", async () => {
  const f = tabFixture(), a = f.newTab(); await a.client.visit("/"); await a.client.visit("/profile");
  f.held.clear(); const reloaded = clientModule.createTitleActivityClient(a.options);
  await reloaded.visit("/profile", true); await reloaded.visit("/");
  assert.equal(f.streams.size, 1); assert.equal(f.total(), 1);
});
