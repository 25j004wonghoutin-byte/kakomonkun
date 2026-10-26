import test from "node:test";
import assert from "node:assert/strict";
import { assertReviewNotebookCatalog } from "../scripts/lib/review-notebook-migration.mjs";
import { reviewCatalog } from "./helpers/review-notebook-migration-memory.mjs";

test("storage preflight accepts both protected tables and required constraints", () => {
  assert.doesNotThrow(() => assertReviewNotebookCatalog(reviewCatalog()));
});
test("storage preflight rejects missing constraints indexes RLS or direct access", () => {
  for (const mutate of [
    rows => rows.pop(),
    rows => { rows[0].rls = false; },
    rows => { rows[0].constraints = rows[0].constraints.slice(1); },
    rows => { rows[1].indexes = []; },
    rows => { rows[1].direct_access = true; },
    rows => { rows[0].policies = 1; },
  ]) { const rows = reviewCatalog(); mutate(rows); assert.throws(() => assertReviewNotebookCatalog(rows)); }
});
