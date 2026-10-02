import assert from "node:assert/strict";
import test from "node:test";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";
import { createBoardCommentInTransaction } from "../src/lib/board/write-comments.ts";

// External FK-lock boundary, not an actual PostgreSQL concurrency test.
// FOR UPDATE blocks KEY SHARE; NO KEY UPDATE permits references while serializing owner writes.
test("concurrent cross-user replies can both save recipient FK notifications", async () => {
  const ownerLocks = new Map(); let atPost = 0, release;
  const bothOwnersLocked = new Promise((resolve) => { release = resolve; });
  const now = new Date("2026-10-02T10:00:00Z");
  const run = async (id, recipient) => {
    const db = makeLearningMemory({ user: { id, role: { name: "student" }, status: "active", deletedAt: null } });
    const tx = db.tx;
    tx.$queryRaw = async (strings, ...values) => {
      const sql = strings.join("?");
      if (sql.includes("public.users")) ownerLocks.set(values[0], /FOR NO KEY UPDATE/.test(sql) ? "NO KEY UPDATE" : "UPDATE");
      return [{ id }];
    };
    tx.boardPost.findUnique = async () => {
      if (++atPost === 2) release();
      await bothOwnersLocked;
      return { authorId: recipient, deletedAt: null, author: { status: "active", deletedAt: null } };
    };
    const saveNotification = tx.notification.createMany;
    tx.notification.createMany = async (args) => {
      for (const row of args.data) if (row.recipientId !== id && ownerLocks.get(row.recipientId) === "UPDATE") {
        throw Error("cross-user recipient FK KEY SHARE conflicts with FOR UPDATE owner lock");
      }
      return saveNotification(args);
    };
    const result = await createBoardCommentInTransaction(tx, { id, roleName: "student" }, "post", "reply", now);
    return { result, notifications: db.state.notifications };
  };
  const results = await Promise.allSettled([run("a", "b"), run("b", "a")]);
  assert.deepEqual(results.map((item) => item.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual(results.map((item) => item.value.notifications.find((row) => row.type === "board_reply")?.recipientId), ["b", "a"]);
});
