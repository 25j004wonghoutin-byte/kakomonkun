import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toBoardAuthor } from "../src/lib/board/contract.ts";
import { PostCard } from "../src/app/board/post-card.tsx";
import { PostDetail } from "../src/app/board/posts/[postId]/post-detail.tsx";

const row = {
  id: "author", displayName: "投稿した学生", role: { name: "student" },
  studentProfile: { avatarUrl: null, currentTitle: { name: "毎日の一歩" }, bannerColor: "#F6E0E7" },
  teacherProfile: null,
};
const post = {
  id: "post", body: "今日も学習しました。", isPinned: false, createdAt: "2026-11-05T00:00:00Z",
  author: { id: "author", displayName: "投稿した学生", avatarUrl: null, titleName: "毎日の一歩", bannerColor: "#f6e0e7", isTeacher: false },
  commentCount: 1, likeCount: 0, likedByMe: false, canDelete: false, canPin: false,
};
const actions = { pending: false, onReply() {}, onLike() {}, onPin() {}, onDelete() {} };

test("public board authors include only a normalized saved banner color alongside public identity", () => {
  assert.deepEqual(toBoardAuthor({ ...row, email: "private@example.invalid", studentProfile: { ...row.studentProfile, totalPoints: 123 } }), {
    id: "author", displayName: "投稿した学生", avatarUrl: null, titleName: "毎日の一歩", bannerColor: "#f6e0e7", isTeacher: false,
  });
  for (const bannerColor of [undefined, null, "red", "#fff", "url(x)"]) {
    assert.equal(toBoardAuthor({ ...row, studentProfile: { ...row.studentProfile, bannerColor } }).bannerColor, "#deece6");
  }
  assert.equal(toBoardAuthor({ ...row, role: { name: "teacher" } }).bannerColor, "#deece6");
  assert.equal(toBoardAuthor({ ...row, role: { name: "teacher" } }).titleName, null);
});

test("a board post shows its author's pink title highlight without changing its content or profile link", () => {
  const html = renderToStaticMarkup(React.createElement(PostCard, { post, ...actions }));
  assert.match(html, /background-color:#f6e0e7/);
  assert.match(html, /color:#000000/);
  assert.match(html, /今日も学習しました。/);
  assert.match(html, /href="\/users\/author\?returnTo=%2Fboard"/);
});

test("thread replies each retain their own author's color, including readable text on a dark highlight", () => {
  const comment = { id: "reply", postId: post.id, body: "一緒に頑張りましょう。", createdAt: post.createdAt, canDelete: false,
    author: { ...post.author, id: "replier", displayName: "返信した学生", bannerColor: "#112233", titleName: "続ける力" } };
  const html = renderToStaticMarkup(React.createElement(PostDetail, { initialThread: { post, comments: [comment] }, viewerName: "閲覧者" }));
  assert.match(html, /background-color:#f6e0e7/);
  assert.match(html, /background-color:#112233/);
  assert.match(html, /color:#ffffff/);
  assert.match(html, /続ける力/);
  assert.match(html, /一緒に頑張りましょう。/);
});
