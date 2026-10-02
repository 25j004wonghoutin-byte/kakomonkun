import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20261001000000_title_conditions.sql", import.meta.url);
const getSql = () => {
  assert.ok(existsSync(migrationUrl), "the additive title migration must exist");
  return readFileSync(migrationUrl, "utf8");
};
const tables = ["user_title_unlocks", "random_quiz_attempts", "student_activity_days", "student_navigation_progress"];

test("migration_is_additive: four tables protected by RLS, no destructive/history writes", () => {
  const sql = getSql();
  assert.equal([...sql.matchAll(/CREATE TABLE public\.(\w+)/g)].length, 4);
  for (const table of tables) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}\\b`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE\s+FROM|CREATE\s+POLICY)\b/i);
  assert.doesNotMatch(sql, /(?:UPDATE|INSERT INTO|ALTER TABLE)\s+public\.(?:user_titles|point_transactions|notifications|daily_qa_answers|practice_answers)\b/i);
  assert.match(sql, /CHECK\s*\(price_points >= 0\)/);
  assert.match(sql, /(?:PRIMARY KEY|UNIQUE)\s*\(user_id, title_id\)/);
  assert.match(sql, /UNIQUE\s*\(user_id, answer_sequence\)/);
  assert.match(sql, /PRIMARY KEY\s*\(user_id, activity_date\)/);
  assert.match(sql, /PRIMARY KEY\s*\(user_id, tab_id\)/);
  assert.match(sql, /CHECK\s*\(round_trips >= 0\)/);
  assert.match(sql, /CHECK\s*\(last_sequence >= 0\)/);
  for (const column of ["selected_choice_id", "is_correct", "answer_date", "answered_at", "answer_sequence"]) {
    assert.match(sql, new RegExp(`${column} IS NULL`));
    assert.match(sql, new RegExp(`${column} IS NOT NULL`));
  }
  assert.match(sql, /CHECK\s*\(answer_sequence > 0\)/);
  assert.match(sql, /REFERENCES public\.question_choices\(id\) ON DELETE RESTRICT/);
});

test("legacy_ids_survive: catalog conflicts update metadata only, never IDs or ownership", () => {
  const sql = getSql();
  const update = sql.split(/ON CONFLICT\s*\(name\)\s*DO UPDATE SET/i)[1];
  assert.ok(update, "existing title names must be upserted instead of replaced");
  assert.doesNotMatch(update, /\bid\s*=/i);
  assert.doesNotMatch(update, /\b(?:purchased_at|equipped_at|created_at)\s*=/i);
  assert.match(sql, /titles_catalog_key_key UNIQUE\s*\(catalog_key\)/);
  assert.match(update, /catalog_key = EXCLUDED\.catalog_key/);
});

test("new catalog rows supply updated_at explicitly because the existing DB has no default", () => {
  const sql = getSql();
  assert.match(sql, /INSERT INTO public\.titles \([^)]*updated_at\)/);
  assert.match(sql, /SELECT catalog_key, name, price_points, acquisition_kind, sort_order, now\(\)/);
});

test("migration_catalog_matches_runtime: SQL carries all 66 names, prices and acquisition kinds", async () => {
  const sql = getSql();
  const catalogUrl = new URL("../src/lib/titles/catalog.ts", import.meta.url);
  assert.ok(existsSync(catalogUrl));
  const { TITLE_CATALOG } = await import(catalogUrl.href);
  const rows = [...sql.matchAll(/\('(v1-\d{3})', '((?:[^']|'')*)', (\d+), '(starter|points|condition)', (\d+)\)/g)];
  assert.equal(rows.length, 66);
  assert.deepEqual(rows.map((row) => [row[1], row[2].replaceAll("''", "'"), Number(row[3]), row[4]]), TITLE_CATALOG.map(({ key, name, pricePoints, acquisitionKind }) => [key, name, pricePoints, acquisitionKind]));
});

test("Prisma mirrors additive metadata and all four persistence models", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  for (const model of ["UserTitleUnlock", "RandomQuizAttempt", "StudentActivityDay", "StudentNavigationProgress"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /catalogKey\s+String\?[^\n]+@map\("catalog_key"\)/);
  assert.match(schema, /titleBackfilledAt\s+DateTime\?/);
  assert.match(schema, /titleTrackingStartedAt\s+DateTime\?/);
});
