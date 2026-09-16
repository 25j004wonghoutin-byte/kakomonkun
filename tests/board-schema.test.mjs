import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("board migration adds only four tables and no destructive SQL", () => {
  const sql = readFileSync(
    "supabase/migrations/20260916000000_board_core.sql",
    "utf8",
  );

  for (const name of [
    "board_posts",
    "board_comments",
    "board_post_likes",
    "board_delete_logs",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${name}\\b`, "i"));
  }

  assert.doesNotMatch(
    sql,
    /\b(drop|truncate|delete\s+from|prisma\s+db\s+push)\b/i,
  );
  assert.match(sql, /is_pinned boolean not null default false/i);
  assert.equal((sql.match(/enable row level security/gi) ?? []).length, 4);
});
