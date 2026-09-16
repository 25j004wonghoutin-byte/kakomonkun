import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCreatePostPayload,
  parsePinPayload,
} from "../src/lib/board/validation.ts";

test("create never accepts an initial pin flag", () => {
  assert.deepEqual(parseCreatePostPayload({ body: "今日の学習" }), {
    body: "今日の学習",
  });
  assert.equal(
    parseCreatePostPayload({ body: "今日の学習", isPinned: true }),
    null,
  );
  assert.deepEqual(parsePinPayload({ isPinned: true }), { isPinned: true });
  assert.equal(parsePinPayload({ isPinned: "true" }), null);
});
