import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { makeTitleMemory } from "./helpers/title-memory.mjs";

const unlocksUrl = new URL("../src/lib/titles/unlocks.ts", import.meta.url);
const getUnlocks = async () => {
  assert.ok(existsSync(unlocksUrl), "permanent unlock service must exist");
  return import(unlocksUrl.href);
};
const now = new Date("2026-10-02T02:00:00Z");
const achieved = () => makeTitleMemory({ posts: Array.from({ length: 10 }, () => ({ deletedAt: null })) });

test("unlock_once: two evaluations keep one qualification, one notification and the first date", async () => {
  const { syncTitleUnlocks } = await getUnlocks();
  const memory = achieved();
  const first = await memory.prisma.$transaction((tx) => syncTitleUnlocks(tx, "student", { now, source: "event" }));
  const second = await memory.prisma.$transaction((tx) => syncTitleUnlocks(tx, "student", { now: new Date("2026-10-03"), source: "event" }));
  assert.deepEqual(first.newlyUnlockedKeys, ["v1-023"]);
  assert.deepEqual(second.newlyUnlockedKeys, []);
  assert.equal(memory.state.unlocks.length, 1);
  assert.equal(memory.state.notifications.length, 1);
  assert.equal(memory.state.unlocks[0].unlockedAt.toISOString(), now.toISOString());
  assert.equal(memory.state.owned.length, 0);
  assert.match(memory.state.locks[0], /users/);
  assert.match(memory.state.locks[1], /student_profiles/);
});

test("later failure never removes a persisted eligibility", async () => {
  const { syncTitleUnlocks } = await getUnlocks();
  const memory = achieved();
  await memory.prisma.$transaction((tx) => syncTitleUnlocks(tx, "student", { now, source: "event" }));
  memory.state.posts = [];
  await memory.prisma.$transaction((tx) => syncTitleUnlocks(tx, "student", { now, source: "event" }));
  assert.equal(memory.state.unlocks.length, 1);
  assert.equal(memory.state.notifications.length, 1);
});

test("rollback_is_atomic: a failed notification leaves no eligibility or backfill completion marker", async () => {
  const { backfillTitleUnlocks } = await getUnlocks();
  const memory = achieved();
  memory.state.failNotifications = true;
  await assert.rejects(backfillTitleUnlocks(memory.prisma, "student", now), /notification save failed/);
  assert.equal(memory.state.unlocks.length, 0);
  assert.equal(memory.state.notifications.length, 0);
  assert.equal(memory.state.profile.titleBackfilledAt, null);
  assert.equal(memory.state.profile.titleTrackingStartedAt, null);
});

test("owned_is_not_notified: existing owners and the starter receive no eligibility notification", async () => {
  const { syncTitleUnlocks } = await getUnlocks();
  const memory = achieved();
  memory.state.owned = ["v1-023", "v1-014"];
  await memory.prisma.$transaction((tx) => syncTitleUnlocks(tx, "student", { now, source: "backfill" }));
  assert.equal(memory.state.notifications.length, 0);
  assert.ok(!memory.state.unlocks.some((row) => row.titleId === "v1-014"));
});

test("teachers are excluded before attempting profile backfill or eligibility writes", async () => {
  const { syncTitleUnlocks, backfillTitleUnlocks } = await getUnlocks();
  const memory = achieved();
  memory.state.user.role.name = "teacher";
  memory.state.profile = null;
  assert.deepEqual(await memory.prisma.$transaction((tx) => syncTitleUnlocks(tx, "student", { now, source: "event" })), { newlyUnlockedKeys: [] });
  assert.deepEqual(await backfillTitleUnlocks(memory.prisma, "student", now), { newlyUnlockedKeys: [] });
  assert.equal(memory.state.unlocks.length, 0);
  assert.equal(memory.state.notifications.length, 0);
});

test("backfill_marker_after_success: first proven history evaluation marks success once and does not fabricate missing activity", async () => {
  const { backfillTitleUnlocks } = await getUnlocks();
  const memory = achieved();
  await backfillTitleUnlocks(memory.prisma, "student", now);
  assert.equal(memory.state.profile.titleBackfilledAt.toISOString(), now.toISOString());
  assert.equal(memory.state.profile.titleTrackingStartedAt.toISOString(), now.toISOString());
  await backfillTitleUnlocks(memory.prisma, "student", new Date("2026-10-03"));
  assert.equal(memory.state.profile.titleBackfilledAt.toISOString(), now.toISOString());
  assert.equal(memory.state.notifications.length, 1);
  assert.ok(!memory.state.unlocks.some((row) => ["v1-017", "v1-020", "v1-036"].includes(row.titleId)));
});

test("name change eligibility comes only from a real successful change event", async () => {
  const { syncTitleUnlocks } = await getUnlocks();
  const memory = makeTitleMemory();
  await memory.prisma.$transaction((tx) => syncTitleUnlocks(tx, "student", { now, source: "event", displayNameChanged: false }));
  assert.equal(memory.state.unlocks.length, 0);
  await memory.prisma.$transaction((tx) => syncTitleUnlocks(tx, "student", { now, source: "event", displayNameChanged: true }));
  assert.deepEqual(memory.state.unlocks.map((row) => row.titleId), ["v1-050"]);
});
