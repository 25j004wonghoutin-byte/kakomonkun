import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoardBody, isUuid } from "../src/lib/board/validation.ts";
import { canInteractWithPost } from "../src/lib/board/permissions.ts";

test("reply shares the post body limit and requires a UUID target", () => {
  assert.equal(parseBoardBody("\n  お答えします  "), "お答えします");
  assert.equal(parseBoardBody("あ".repeat(281)), null);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(canInteractWithPost(null), true);
  assert.equal(canInteractWithPost(new Date()), false);
});
