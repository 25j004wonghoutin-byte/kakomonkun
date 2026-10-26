import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyReviewNotebookMigration } from "../scripts/lib/review-notebook-migration.mjs";
import { migrationMemory, reviewCatalog } from "./helpers/review-notebook-migration-memory.mjs";
const getSql = () => readFileSync(new URL("../supabase/migrations/20261026000000_review_notebook.sql", import.meta.url), "utf8");

test("migration refuses unrecorded existing tables", async () => {
  const { state, db } = migrationMemory({ catalog: reviewCatalog() });
  await assert.rejects(applyReviewNotebookMigration(db, getSql())); assert.equal(state.ddl.length, 0);
});
test("migration refuses SQL drift", async () => {
  const { state, db } = migrationMemory({ history: [{ statements: ["different SQL"] }], catalog: reviewCatalog() });
  await assert.rejects(applyReviewNotebookMigration(db, getSql())); assert.equal(state.ddl.length, 0);
});
test("same recorded migration verifies catalog and does not execute DDL", async () => {
  const sql = getSql(); const { state, db } = migrationMemory({ history: [{ statements: [sql.replace(/\r\n/g, "\n")] }], catalog: reviewCatalog() });
  assert.deepEqual(await applyReviewNotebookMigration(db, sql), { alreadyApplied: true }); assert.equal(state.ddl.length, 0);
});
test("first migration records DDL and history together and retry is read-only", async () => {
  const { state, db } = migrationMemory(); const sql = getSql();
  assert.deepEqual(await applyReviewNotebookMigration(db, sql), { alreadyApplied: false });
  assert.equal(state.ddl.length, 1); assert.equal(state.history[0].version, "20261026000000");
  assert.ok(state.events.some(s => s.includes("lock_timeout = '5s'"))); assert.ok(state.events.some(s => s.includes("statement_timeout = '30s'")));
  assert.deepEqual(await applyReviewNotebookMigration(db, sql), { alreadyApplied: true }); assert.equal(state.ddl.length, 1);
});
test("failed DDL never commits migration history", async () => {
  const { state, db } = migrationMemory({ fail: true }); await assert.rejects(applyReviewNotebookMigration(db, getSql()));
  assert.equal(state.history.length, 0); assert.equal(state.ddl.length, 0);
});
test("same history with damaged catalog stops without repair", async () => {
  const sql = getSql(); const catalog = reviewCatalog(); catalog[0].rls = false;
  const { state, db } = migrationMemory({ history: [{ statements: [sql] }], catalog });
  await assert.rejects(applyReviewNotebookMigration(db, sql)); assert.equal(state.ddl.length, 0);
});
