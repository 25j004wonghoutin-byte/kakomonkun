import assert from "node:assert/strict";
import test from "node:test";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";
let community = {}, posts = {}, comments = {};
try { community = await import("../src/lib/titles/community-events.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
// The current board wrappers eagerly construct Prisma; defer loading until tx services exist.
const now = new Date("2026-10-02T10:00:00Z");
const actor = { id: "student", roleName: "student" };
const user = { id: "student", displayName: "あおい", role: { name: "student" }, status: "active", deletedAt: null };
const update = (db, name, bio = null) => { assert.equal(typeof community.updateStudentProfile, "function"); return db.prisma.$transaction((tx) => community.updateStudentProfile(tx, "student", name, bio, now)); };

test("same trimmed name and bio-only edit do not unlock name title", async () => {
  const db = makeLearningMemory({ user }); await update(db, " あおい ", "自己紹介");
  assert.equal(db.state.user.displayName, "あおい"); assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-050"), false);
});
test("first actual name change permanently unlocks and notifies once", async () => {
  const db = makeLearningMemory({ user }); await update(db, "みさき"); await update(db, "ゆうき");
  assert.equal(db.state.unlocks.filter((row) => row.titleId === "v1-050").length, 1);
  assert.equal(db.state.notifications.filter((row) => row.titleId === "v1-050").length, 1);
});
test("successful tenth post counts previously deleted posts", async () => {
  posts = await import("../src/lib/board/write-posts.ts"); assert.equal(typeof posts.createBoardPostInTransaction, "function");
  const db = makeLearningMemory({ posts: Array.from({ length: 9 }, () => ({ deletedAt: now })) });
  await db.prisma.$transaction((tx) => posts.createBoardPostInTransaction(tx, actor, "投稿", now));
  assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-023"), true); assert.equal(db.state.posts.length, 10);
});
test("tenth self reply counts but emits no reply notification", async () => {
  comments = await import("../src/lib/board/write-comments.ts");
  const db = makeLearningMemory({ posts: [{ id: "post", authorId: "student", deletedAt: null, author: { status: "active", deletedAt: null } }], comments: Array.from({ length: 9 }, () => ({ deletedAt: now })) });
  await db.prisma.$transaction((tx) => comments.createBoardCommentInTransaction(tx, actor, "post", "返信", now));
  assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-024"), true);
  assert.equal(db.state.notifications.filter((row) => row.type === "board_reply").length, 0);
});
test("reply to another user preserves ordinary notification", async () => {
  comments = await import("../src/lib/board/write-comments.ts");
  const db = makeLearningMemory({ posts: [{ id: "post", authorId: "other", deletedAt: null, author: { status: "active", deletedAt: null } }] });
  await db.prisma.$transaction((tx) => comments.createBoardCommentInTransaction(tx, actor, "post", "返信", now));
  assert.equal(db.state.notifications.some((row) => row.type === "board_reply" && row.recipientId === "other"), true);
});
test("teacher ordinary posts and replies create no title or activity rows", async () => {
  posts = await import("../src/lib/board/write-posts.ts"); comments = await import("../src/lib/board/write-comments.ts");
  assert.equal(typeof posts.createBoardPostInTransaction, "function");
  const db = makeLearningMemory({ user: { ...user, role: { name: "teacher" } }, posts: [{ id: "post", authorId: "student", deletedAt: null, author: { status: "active", deletedAt: null } }] });
  const teacher = { ...actor, roleName: "teacher" };
  await db.prisma.$transaction((tx) => posts.createBoardPostInTransaction(tx, teacher, "投稿", now));
  await db.prisma.$transaction((tx) => comments.createBoardCommentInTransaction(tx, teacher, "post", "返信", now));
  assert.equal(db.state.posts.length, 2); assert.equal(db.state.comments.length, 1); assert.equal(db.state.activities.length, 0); assert.equal(db.state.unlocks.length, 0);
});
