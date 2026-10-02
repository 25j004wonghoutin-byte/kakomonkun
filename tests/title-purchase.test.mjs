import assert from "node:assert/strict";
import test from "node:test";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";
import { COMPLETE_COLLECTION_V1_KEYS } from "../src/lib/titles/catalog.ts";
let service = {};
try { service = await import("../src/lib/titles/purchase.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const now = new Date("2026-10-02T10:00:00Z");
const profile = (points) => ({ userId: "student", titleTrackingStartedAt: now, titleBackfilledAt: now, totalPoints: points, currentTitleId: "legacy-equipped" });
const purchase = (db, id) => { assert.equal(typeof service.purchaseTitle, "function"); return db.prisma.$transaction((tx) => service.purchaseTitle(tx, "student", id, now)); };
const unlock = (id) => ({ userId: "student", titleId: id, unlockedAt: new Date("2020-01-01T00:00:00Z"), source: "event" });
test("locked direct purchase is forbidden with no ownership", async () => {
  const db = makeLearningMemory({ profile: profile(100) }); await assert.rejects(purchase(db, "v1-002"), (error) => error.code === "locked");
  assert.equal(db.state.owned.length, 0); assert.equal(db.state.profile.totalPoints, 100);
});
test("free unlocked title adds ownership without points history or auto equip", async () => {
  const db = makeLearningMemory({ profile: profile(100), unlocks: [unlock("v1-002")] }); const result = await purchase(db, "v1-002");
  assert.equal(result.title.name, "ランダム名人"); assert.equal(result.totalPoints, 100); assert.equal(+result.purchasedAt, +now);
  assert.deepEqual(db.state.owned, ["v1-002"]); assert.equal(db.state.points.length, 0); assert.equal(db.state.profile.currentTitleId, "legacy-equipped");
});
test("eligibility remains purchasable after the original run has ended", async () => {
  const db = makeLearningMemory({ profile: profile(0), unlocks: [unlock("v1-039")] }); await purchase(db, "v1-039"); assert.deepEqual(db.state.owned, ["v1-039"]);
});
test("exact paid balance reaches zero with one debit", async () => {
  const db = makeLearningMemory({ profile: profile(2) }); const result = await purchase(db, "v1-049");
  assert.equal(result.totalPoints, 0); assert.equal(db.state.points.length, 1); assert.equal(db.state.points[0].points, -2); assert.equal(db.state.profile.currentTitleId, "legacy-equipped");
});
test("short balance rolls back ownership and history", async () => {
  const db = makeLearningMemory({ profile: profile(1) }); await assert.rejects(purchase(db, "v1-049"), (error) => error.code === "insufficient");
  assert.equal(db.state.profile.totalPoints, 1); assert.equal(db.state.owned.length, 0); assert.equal(db.state.points.length, 0);
});
test("serialized double purchase creates one ownership and one debit", async () => {
  const db = makeLearningMemory({ profile: profile(4) }); const results = await Promise.allSettled([purchase(db, "v1-049"), purchase(db, "v1-049")]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1); assert.equal(results[1].reason.code, "owned");
  assert.equal(db.state.profile.totalPoints, 2); assert.equal(db.state.owned.length, 1); assert.equal(db.state.points.length, 1);
});
test("different serialized purchases cannot make the balance negative", async () => {
  const db = makeLearningMemory({ profile: profile(10) }); const results = await Promise.allSettled([purchase(db, "v1-018"), purchase(db, "v1-019")]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1); assert.equal(db.state.profile.totalPoints, 0); assert.equal(db.state.owned.length, 1);
});
test("twentieth owned title unlocks collector without auto buying it", async () => {
  const db = makeLearningMemory({ profile: profile(2), owned: ["v1-014", ...Array.from({ length: 18 }, (_, i) => `legacy-${i}`)] }); await purchase(db, "v1-049");
  assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-022"), true); assert.equal(db.state.owned.includes("v1-022"), false);
});
test("last of fixed58 unlocks complete collection without auto buying it", async () => {
  const db = makeLearningMemory({ profile: profile(50), owned: COMPLETE_COLLECTION_V1_KEYS.filter((key) => key !== "v1-065") }); await purchase(db, "v1-065");
  assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-001"), true); assert.equal(db.state.owned.includes("v1-001"), false); assert.equal(db.state.owned.length, 58);
});
test("failed eligibility notification rolls back the complete purchase", async () => {
  const db = makeLearningMemory({ profile: profile(2), owned: Array.from({ length: 19 }, (_, i) => `legacy-${i}`), failNotifications: true });
  await assert.rejects(purchase(db, "v1-049"), /notification save failed/); assert.equal(db.state.profile.totalPoints, 2); assert.equal(db.state.owned.length, 19); assert.equal(db.state.points.length, 0); assert.equal(db.state.unlocks.length, 0);
});
for (const id of ["v1-014", "v1-009", "unknown"]) test(`starter, unimplemented or unknown title ${id} is unavailable`, async () => {
  const db = makeLearningMemory({ profile: profile(1000), unlocks: [unlock(id)] }); await assert.rejects(purchase(db, id), (error) => error.code === "unavailable");
});
test("legacy-only and inactive catalog titles are not new sales", async () => {
  const db = makeLearningMemory({ profile: profile(1000), catalogTitles: [
    { id: "legacy", catalogKey: null, acquisitionKind: null, name: "旧称号", pricePoints: 300, isActive: true },
    { id: "v1-049", catalogKey: "v1-049", acquisitionKind: "points", name: "Hello World", pricePoints: 2, isActive: false },
  ] });
  await assert.rejects(purchase(db, "legacy"), (error) => error.code === "unavailable"); await assert.rejects(purchase(db, "v1-049"), (error) => error.code === "unavailable");
});
