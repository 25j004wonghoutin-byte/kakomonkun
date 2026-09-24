import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("notification migration is additive and deduplicates each event", () => {
  const sql = readFileSync(
    "supabase/migrations/20260924000000_add_notifications.sql",
    "utf8",
  );

  assert.match(sql, /create table public\.notifications\b/i);
  assert.match(sql, /unique \(recipient_id, type, board_comment_id\)/i);
  assert.match(sql, /unique \(recipient_id, type, board_post_id\)/i);
  assert.match(sql, /unique \(recipient_id, type, title_id\)/i);
  assert.match(sql, /where read_at is null/i);
  assert.match(sql, /enable row level security/i);
  assert.doesNotMatch(
    sql,
    /\b(drop|truncate|delete\s+from|prisma\s+db\s+push)\b/i,
  );
});
