import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { ensureStarterTitleForStudent } from "../src/lib/starter-title.ts";

const catalogUrl = new URL("../src/lib/titles/catalog.ts", import.meta.url);
const getCatalog = async () => {
  assert.ok(existsSync(catalogUrl), "the approved title catalog must exist");
  return import(catalogUrl.href);
};

test("catalog_counts: all approved titles have unique keys and valid acquisition prices", async () => {
  const { TITLE_CATALOG } = await getCatalog();
  assert.equal(TITLE_CATALOG.length, 66);
  assert.equal(new Set(TITLE_CATALOG.map((title) => title.key)).size, 66);
  assert.equal(new Set(TITLE_CATALOG.map((title) => title.name)).size, 66);
  for (const [kind, count] of [["starter", 1], ["points", 33], ["condition", 32]]) {
    assert.equal(TITLE_CATALOG.filter((title) => title.acquisitionKind === kind).length, count);
  }
  for (const title of TITLE_CATALOG) {
    assert.ok(Number.isInteger(title.pricePoints));
    assert.ok(title.acquisitionKind === "points" ? title.pricePoints > 0 : title.pricePoints === 0);
    assert.equal(title.condition !== null, title.acquisitionKind === "condition");
  }
  const ranking = TITLE_CATALOG.filter((title) => title.condition?.type.startsWith("monthly_"));
  assert.equal(ranking.length, 7);
  assert.ok(ranking.every((title) => !title.implemented));
  assert.ok(TITLE_CATALOG.filter((title) => !ranking.includes(title)).every((title) => title.implemented));
});

test("catalog_matches_approved_spec: every name and provisional price matches the signed-off list", async () => {
  const { TITLE_CATALOG } = await getCatalog();
  const spec = readFileSync(new URL("../docs/superpowers/specs/2026-10-01-title-conditions-design.md", import.meta.url), "utf8");
  const rows = [...spec.matchAll(/^\| (v1-\d{3}) \| ([^|]+) \| [^|]+ \| (\d+) \|/gm)];
  assert.equal(rows.length, 66);
  assert.deepEqual(TITLE_CATALOG.map(({ key, name, pricePoints }) => [key, name, pricePoints]), rows.map((row) => [row[1], row[2].trim(), Number(row[3])]));
});

test("collection_is_frozen: requires exactly the fixed 58 non-ranking titles", async () => {
  const { TITLE_CATALOG, COMPLETE_COLLECTION_V1_KEYS } = await getCatalog();
  const exclusions = ["v1-001", "v1-009", "v1-011", "v1-040", "v1-041", "v1-042", "v1-043", "v1-044"];
  assert.equal(COMPLETE_COLLECTION_V1_KEYS.length, 58);
  assert.equal(new Set(COMPLETE_COLLECTION_V1_KEYS).size, 58);
  assert.ok(Object.isFrozen(COMPLETE_COLLECTION_V1_KEYS));
  assert.deepEqual(COMPLETE_COLLECTION_V1_KEYS, TITLE_CATALOG.map((title) => title.key).filter((key) => !exclusions.includes(key)));
  assert.deepEqual(TITLE_CATALOG.find((title) => title.key === "v1-001").condition, { type: "owned_set", keys: COMPLETE_COLLECTION_V1_KEYS });
});

test("approved_thresholds: uses revised practice, ranking and activity requirements", async () => {
  const { TITLE_CATALOG } = await getCatalog();
  const condition = (key) => TITLE_CATALOG.find((title) => title.key === key).condition;
  assert.deepEqual(condition("v1-048"), { type: "practice_perfect_run", count: 3 });
  assert.deepEqual(condition("v1-011"), { type: "monthly_top_run", rank: 3, count: 5 });
  assert.deepEqual(condition("v1-037"), { type: "navigation_round_trips", count: 5 });
  assert.deepEqual(condition("v1-022"), { type: "owned_count", count: 20, excludeKey: "v1-022" });
  assert.deepEqual(condition("v1-066"), { type: "activity_run", count: 365 });
});

test("starter metadata supplements the existing ID without overwriting equipped titles", async () => {
  let metadata;
  let ownership;
  const tx = {
    title: { upsert: async (args) => { metadata = args; return { id: "legacy-starter-id" }; } },
    studentProfile: { updateMany: async (args) => { assert.equal(args.where.currentTitleId, null); return { count: 0 }; } },
    userTitle: { upsert: async (args) => { ownership = args; } },
  };
  await ensureStarterTitleForStudent(tx, "student-id");
  assert.equal(metadata.where.name, "駆け出しのエンジニア");
  assert.equal(metadata.create.catalogKey, "v1-014");
  assert.deepEqual(metadata.update, { catalogKey: "v1-014", acquisitionKind: "starter" });
  assert.equal(ownership.create.titleId, "legacy-starter-id");
  assert.equal(ownership.create.equippedAt, null);
  assert.deepEqual(ownership.update, {});
});
