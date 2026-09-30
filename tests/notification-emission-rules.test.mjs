import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBoardPinnedNotifications,
  createBoardReplyNotification,
  shouldBroadcastPinnedPost,
  shouldNotifyBoardReply,
} from "../src/lib/notifications/write.ts";

test("reply notifications skip self replies", () => {
  assert.equal(shouldNotifyBoardReply("author", "author"), false);
  assert.equal(shouldNotifyBoardReply("author", "other"), true);
});

test("pin notifications emit only on the first false to true transition", () => {
  assert.equal(shouldBroadcastPinnedPost(false, true), true);
  assert.equal(shouldBroadcastPinnedPost(true, true), false);
  assert.equal(shouldBroadcastPinnedPost(true, false), false);
});

test("a self reply does not insert a notification", async () => {
  let insertCalled = false;
  const tx = {
    notification: {
      async createMany() {
        insertCalled = true;
        return { count: 1 };
      },
    },
  };

  await createBoardReplyNotification(tx, {
    postAuthorId: "author",
    postAuthorStatus: "active",
    postAuthorDeletedAt: null,
    actorId: "author",
    boardCommentId: "comment-1",
  });

  assert.equal(insertCalled, false);
});

test("a reply from another user notifies the active post author", async () => {
  let inserted;
  const tx = {
    notification: {
      async createMany(value) {
        inserted = value;
        return { count: 1 };
      },
    },
  };

  await createBoardReplyNotification(tx, {
    postAuthorId: "author",
    postAuthorStatus: "active",
    postAuthorDeletedAt: null,
    actorId: "replier",
    boardCommentId: "comment-1",
  });

  assert.deepEqual(inserted, {
    data: [
      {
        recipientId: "author",
        actorId: "replier",
        type: "board_reply",
        boardCommentId: "comment-1",
      },
    ],
    skipDuplicates: true,
  });
});

test("a reply does not notify an inactive post author", async () => {
  let insertCalled = false;
  const tx = {
    notification: {
      async createMany() {
        insertCalled = true;
        return { count: 1 };
      },
    },
  };

  await createBoardReplyNotification(tx, {
    postAuthorId: "author",
    postAuthorStatus: "inactive",
    postAuthorDeletedAt: null,
    actorId: "replier",
    boardCommentId: "comment-1",
  });

  assert.equal(insertCalled, false);
});

test("pinning an already pinned post does not read the student list", async () => {
  let studentListRead = false;
  const tx = {
    user: {
      async findMany() {
        studentListRead = true;
        return [];
      },
    },
    notification: {
      async createMany() {
        throw new Error("notification insert should not run");
      },
    },
  };

  await createBoardPinnedNotifications(tx, {
    wasPinned: true,
    isPinned: true,
    actorId: "teacher",
    boardPostId: "post-1",
  });

  assert.equal(studentListRead, false);
});

test("the first pin broadcasts once to active students with duplicate skipping", async () => {
  let studentQuery;
  let inserted;
  const tx = {
    user: {
      async findMany(value) {
        studentQuery = value;
        return [{ id: "student-1" }, { id: "student-2" }];
      },
    },
    notification: {
      async createMany(value) {
        inserted = value;
        return { count: 2 };
      },
    },
  };

  await createBoardPinnedNotifications(tx, {
    wasPinned: false,
    isPinned: true,
    actorId: "teacher",
    boardPostId: "post-1",
  });

  assert.deepEqual(studentQuery, {
    where: {
      role: { name: "student" },
      status: "active",
      deletedAt: null,
    },
    select: { id: true },
  });
  assert.deepEqual(inserted, {
    data: [
      {
        recipientId: "student-1",
        actorId: "teacher",
        type: "board_pinned",
        boardPostId: "post-1",
      },
      {
        recipientId: "student-2",
        actorId: "teacher",
        type: "board_pinned",
        boardPostId: "post-1",
      },
    ],
    skipDuplicates: true,
  });
});
