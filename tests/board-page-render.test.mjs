import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveBoardTestImport(request, ...args) {
  const target = request.startsWith("@/")
    ? fileURLToPath(new URL(`../src/${request.slice(2)}`, import.meta.url))
    : request;
  return originalResolveFilename.call(this, target, ...args);
};

function loadTypeScript(module, filename) {
  const source = readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(code, filename);
}

Module._extensions[".tsx"] = loadTypeScript;
Module._extensions[".ts"] = loadTypeScript;

const author = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "みさき",
  avatarUrl: null,
  titleName: "継続学習マスター",
  isTeacher: false,
};
const post = {
  id: "00000000-0000-4000-8000-000000000002",
  body: "今日も一問進めました。",
  isPinned: false,
  createdAt: "2026-09-16T00:00:00.000Z",
  author,
  commentCount: 2,
  likeCount: 0,
  likedByMe: false,
  canDelete: false,
  canPin: false,
};
const thread = {
  post,
  comments: [
    {
      id: "00000000-0000-4000-8000-000000000003",
      postId: post.id,
      body: "先の返信",
      createdAt: "2026-09-16T00:01:00.000Z",
      author,
      canDelete: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      postId: post.id,
      body: "後の返信",
      createdAt: "2026-09-16T00:02:00.000Z",
      author,
      canDelete: false,
    },
  ],
};

test("single post renders chronological replies and a reply field without the removed outer heading", () => {
  const { PostDetail } = require("../src/app/board/posts/[postId]/post-detail.tsx");
  const html = renderToStaticMarkup(
    React.createElement(PostDetail, {
      initialThread: thread,
      viewerName: "あおい",
    }),
  );

  assert.match(html, /今日も一問進めました。/);
  assert.ok(html.indexOf("先の返信") < html.indexOf("後の返信"));
  assert.match(html, /返信を投稿/);
  assert.doesNotMatch(html, /投稿詳細/);
});

test("public profile shows real bio, title and posts without private or duplicate metadata", () => {
  const { PublicProfile } = require("../src/app/board/users/[userId]/public-profile.tsx");
  const html = renderToStaticMarkup(
    React.createElement(PublicProfile, {
      initialProfile: {
        id: author.id,
        displayName: author.displayName,
        avatarUrl: null,
        bio: "毎日の小さな積み重ねを大切にしています。",
        titleName: author.titleName,
        isTeacher: false,
        postCount: 1,
        posts: [post],
        nextCursor: null,
      },
      viewerName: "あおい",
    }),
  );

  assert.match(html, /みさき/);
  assert.match(html, /継続学習マスター/);
  assert.match(html, /毎日の小さな積み重ねを大切にしています。/);
  assert.match(html, /今日も一問進めました。/);
  assert.doesNotMatch(html, /ITパスポート|利用開始|private@example.com/);
});

test("teacher public profile does not invent a bio or title", () => {
  const { PublicProfile } = require("../src/app/board/users/[userId]/public-profile.tsx");
  const html = renderToStaticMarkup(
    React.createElement(PublicProfile, {
      initialProfile: {
        id: author.id,
        displayName: "田中先生",
        avatarUrl: null,
        bio: null,
        titleName: null,
        isTeacher: true,
        postCount: 0,
        posts: [],
        nextCursor: null,
      },
      viewerName: "あおい",
    }),
  );

  assert.match(html, /田中先生/);
  assert.match(html, /先生/);
  assert.doesNotMatch(html, /自己紹介|称号|ITパスポート|利用開始/);
});

test("reply icon opens the composer while reply count links to the single post", () => {
  const { PostCard } = require("../src/app/board/post-card.tsx");
  const html = renderToStaticMarkup(
    React.createElement(PostCard, {
      post: {
        ...post,
        isPinned: true,
        author: { ...author, displayName: "田中先生", titleName: null, isTeacher: true },
      },
      pending: false,
      onReply() {},
      onLike() {},
      onPin() {},
      onDelete() {},
    }),
  );

  assert.match(html, /先生からのお知らせ/);
  assert.match(html, /aria-label="田中先生の投稿に返信"/);
  assert.match(html, /href="\/board\/posts\/00000000-0000-4000-8000-000000000002"[^>]*>2<\/a>/);
});
