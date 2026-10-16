import assert from "node:assert/strict";
import test from "node:test";
import { createAvatarMemory } from "./helpers/avatar-memory.mjs";
import { createAvatarRef } from "../src/lib/avatars/contract.ts";
let api = {};
try { api = await import("../src/lib/avatars/service.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
const userId = "11111111-1111-4111-8111-111111111111";
const old = createAvatarRef(userId, "22222222-2222-4222-8222-222222222222");
const next = createAvatarRef(userId, "33333333-3333-4333-8333-333333333333");
function setup(initial = old.url) {
  assert.equal(typeof api.createAvatarService, "function");
  const mem = createAvatarMemory(initial);
  mem.objects.set(old.key, new Uint8Array([0]));
  return { ...mem, service: api.createAvatarService({ ...mem, newVersion: () => next.version }) };
}
const save = (service, expectedAvatarUrl = old.url) => service.save({ userId, expectedAvatarUrl, image: new Uint8Array([1]) });

test("avatar save uploads before committing and only then removes the previous object", async () => {
  const m = setup(); const before = { ...m.state };
  assert.deepEqual(await save(m.service), { avatarUrl: next.url });
  assert.equal(m.state.avatarUrl, next.url);
  assert.deepEqual(m.events, [["put", next.key], ["replace", next.url], ["check", old.key], ["remove", old.key]]);
  assert.equal(m.objects.has(next.key), true);
  assert.deepEqual({ ...m.state, avatarUrl: before.avatarUrl }, before);
});
test("a conflicting save removes only its own new object and preserves the winner", async () => {
  const m = setup(next.url);
  const winner = createAvatarRef(userId, "44444444-4444-4444-8444-444444444444");
  m.state.avatarUrl = winner.url; m.objects.set(winner.key, new Uint8Array([4]));
  await assert.rejects(() => save(m.service), e => e.status === 409);
  assert.equal(m.state.avatarUrl, winner.url);
  assert.equal(m.objects.has(winner.key), true);
  assert.equal(m.objects.has(next.key), false);
});
test("an unknown commit retains the new object even before its delayed commit becomes visible", async () => {
  const m = setup();
  m.hooks.replace = async () => { throw new Error("connection lost with DO_NOT_LOG"); };
  await assert.rejects(() => save(m.service), e => e.status === 503 && !e.message.includes("DO_NOT_LOG"));
  assert.equal(m.state.avatarUrl, old.url);
  assert.equal(m.objects.has(next.key), true);
  m.state.avatarUrl = next.url;
  assert.equal(m.objects.has(next.key), true);
  assert.equal(m.events.some(e => e[0] === "remove"), false);
});
test("a put with unknown success never alters the database or immediately removes a possible object", async () => {
  const m = setup();
  m.hooks.put = async key => { m.objects.set(key, new Uint8Array([1])); throw new Error("timeout"); };
  await assert.rejects(() => save(m.service), e => e.status === 503);
  assert.equal(m.state.avatarUrl, old.url);
  assert.equal(m.objects.has(next.key), true);
  assert.deepEqual(m.events, [["put", next.key]]);
});
test("cleanup failure does not turn a successful avatar save into a failed update", async () => {
  const m = setup(); m.hooks.remove = async () => { throw new Error("storage down"); };
  assert.deepEqual(await save(m.service), { avatarUrl: next.url });
  assert.equal(m.state.avatarUrl, next.url);
  assert.equal(m.objects.has(next.key), true);
  assert.equal(m.logs.length, 1);
});
test("legacy expectations allow reupload but never delete or fetch an external image", async () => {
  const legacy = "https://legacy.example/avatar.png"; const m = setup(legacy);
  assert.deepEqual(await save(m.service, legacy), { avatarUrl: next.url });
  assert.deepEqual(m.events, [["put", next.key], ["replace", next.url]]);
});
test("avatar removal commits null first, handles already-null and refuses a newer image", async () => {
  const m = setup();
  assert.deepEqual(await m.service.remove({ userId, expectedAvatarUrl: old.url }), { avatarUrl: null });
  assert.equal(m.state.avatarUrl, null);
  assert.deepEqual(m.events, [["replace", null], ["check", old.key], ["remove", old.key]]);
  assert.deepEqual(await m.service.remove({ userId, expectedAvatarUrl: old.url }), { avatarUrl: null });
  m.state.avatarUrl = next.url;
  await assert.rejects(() => m.service.remove({ userId, expectedAvatarUrl: old.url }), e => e.status === 409);
  assert.equal(m.state.avatarUrl, next.url);
});
test("inactive targets and stale versions are not read from Storage", async () => {
  const m = setup();
  assert.deepEqual(await m.service.read(old), new Uint8Array([0]));
  assert.equal(await m.service.read(next), null);
  m.state.activeStudent = false;
  assert.equal(await m.service.read(old), null);
  assert.equal(m.events.filter(e => e[0] === "get").length, 1);
});
