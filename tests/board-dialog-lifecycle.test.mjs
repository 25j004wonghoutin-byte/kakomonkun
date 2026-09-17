import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleBoardDialogOpen } from "../src/app/board/dialog-lifecycle.ts";

test("strict effect setup-cleanup-setup opens one modal and does not close it immediately", async () => {
  const state = { open: false, showCount: 0, closeCount: 0 };
  const dialog = {
    get open() { return state.open; },
    showModal() {
      state.open = true;
      state.showCount += 1;
    },
    close() {
      state.open = false;
      state.closeCount += 1;
    },
  };

  const firstCleanup = scheduleBoardDialogOpen(dialog);
  firstCleanup();
  const secondCleanup = scheduleBoardDialogOpen(dialog);
  await Promise.resolve();

  assert.equal(state.open, true);
  assert.equal(state.showCount, 1);
  assert.equal(state.closeCount, 0);

  secondCleanup();
  assert.equal(state.open, false);
  assert.equal(state.closeCount, 1);
});
