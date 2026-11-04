import assert from "node:assert/strict";
import test from "node:test";
import { getProfileReturnTarget, getPublicProfileHref } from "../src/lib/public-profile-navigation.ts";

const id = "00000000-0000-4000-8000-000000000001";
test("ranking return preserves exam and selected past month", () => {
  const target = getProfileReturnTarget("/ranking?examCode=fe&month=2026-09");
  assert.deepEqual(target, { href: "/ranking?examCode=fe&month=2026-09", label: "ランキングへ戻る" });
  const url = new URL(getPublicProfileHref(id, target.href), "http://local");
  assert.equal(url.pathname, "/users/" + id);
  assert.equal(url.searchParams.get("returnTo"), target.href);
});
test("board and single-post return targets remain internal and explicit", () => {
  assert.deepEqual(getProfileReturnTarget("/board"), { href: "/board", label: "掲示板へ戻る" });
  assert.deepEqual(getProfileReturnTarget("/board/posts/" + id), { href: "/board/posts/" + id, label: "投稿へ戻る" });
  assert.equal(new URL(getPublicProfileHref(id), "http://local").searchParams.get("returnTo"), "/board");
});
test("external, malformed, duplicate and unrelated return targets use the board fallback", () => {
  for (const value of [undefined, null, [], "//evil.example", "https://evil.example/board", "/board/../teacher", "/board\\evil", "/ranking?examCode=invalid&month=2026-09", "/ranking?examCode=fe&examCode=it_passport&month=2026-09", "/ranking?examCode=fe&month=2026-13", "/ranking?examCode=fe&month=2026-9", "/board/posts/not-a-user", "/profile", "/ranking#x"]) {
    assert.equal(getProfileReturnTarget(value).href, "/board", String(value));
  }
  assert.equal(getProfileReturnTarget("/ranking?examCode=fe&month=2026-09&other=drop").href, "/ranking?examCode=fe&month=2026-09");
  assert.equal(getProfileReturnTarget("/ranking").href, "/ranking");
});
