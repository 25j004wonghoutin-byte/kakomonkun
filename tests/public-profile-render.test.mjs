import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicProfile } from "../src/components/public-user-profile.tsx";

const profile = { id: "00000000-0000-4000-8000-000000000001", displayName: "公開用の学生", avatarUrl: null, bio: "少しずつ学習しています。", titleName: "はじめの一歩", isTeacher: false, posts: [], postCount: 0, nextCursor: null };
test("standalone profile keeps public fields and returns to the selected ranking", () => {
  const html = renderToStaticMarkup(React.createElement(PublicProfile, { initialProfile: profile, viewerName: "閲覧者", backTarget: { href: "/ranking?examCode=fe&month=2026-09", label: "ランキングへ戻る" } }));
  for (const text of ["公開用の学生", "少しずつ学習しています。", "はじめの一歩", "投稿", "まだ投稿はありません。"]) assert.ok(html.includes(text));
  assert.match(html, /href="\/ranking\?examCode=fe&amp;month=2026-09"/);
  assert.match(html, /ランキングへ戻る/);
  assert.doesNotMatch(html, /掲示板へ戻る|総ポイント|メール|プロフィールを編集/);
});
test("direct profile visits retain a usable board fallback", () => {
  const html = renderToStaticMarkup(React.createElement(PublicProfile, { initialProfile: profile, viewerName: "閲覧者" }));
  assert.match(html, /href="\/board"/);
  assert.match(html, /掲示板へ戻る/);
});

test("equipped title shares the name row and the my-page highlight", () => {
  const html = renderToStaticMarkup(React.createElement(PublicProfile, { initialProfile: { ...profile, bannerColor: "#aabbcc" }, viewerName: "viewer" }));
  assert.match(html, /background-color:#aabbcc/);
  const row = html.match(/<div class="mt-4[^"]*">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(row); assert.match(row, /公開用の学生/); assert.match(row, /はじめの一歩/);
  assert.match(row, /rounded-full/);
  assert.match(row, /background-color:#aabbcc/);
  assert.doesNotMatch(html, /バナーの色を変更/);
});
test("only the profile owner is offered the banner editor", () => {
  const html = renderToStaticMarkup(React.createElement(PublicProfile, { initialProfile: profile, viewerName: "viewer", viewerId: profile.id }));
  assert.match(html, /バナーの色を変更/);
});
