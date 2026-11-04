import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BANNER_COLOR, getBannerTextColor, normalizeBannerColor } from "../src/lib/profile-banner.ts";
import { createProfileBannerHandler } from "../src/lib/profile-banner-update.ts";
test("banner colors accept only six-digit hex colors and normalize their case", () => {
  assert.equal(normalizeBannerColor("#A1B2C3"), "#a1b2c3");
  for (const value of [null, undefined, "", "#fff", "red", "url(x)", "#12345678", 123]) assert.equal(normalizeBannerColor(value), null);
  assert.equal(DEFAULT_BANNER_COLOR, "#deece6");
});
const request = body => new Request("http://local/api/profile/banner", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
test("banner save updates only the authenticated student's color", async () => {
  const writes = [];
  const handler = createProfileBannerHandler({ getUser: async () => ({ id: "me", role: { name: "student" }, studentProfile: {} }), updateBanner: async (id, color) => { writes.push([id, color]); } });
  const response = await handler(request({ bannerColor: "#ABCDEF", userId: "someone-else", totalPoints: 9999 }));
  assert.equal(response.status, 200); assert.deepEqual(writes, [["me", "#abcdef"]]);
  assert.deepEqual(await response.json(), { bannerColor: "#abcdef" });
});
test("anonymous and teacher banner saves are rejected without writes", async () => {
  for (const user of [null, { id: "teacher", role: { name: "teacher" }, studentProfile: null }]) {
    const handler = createProfileBannerHandler({ getUser: async () => user, updateBanner: async () => assert.fail("no write") });
    assert.equal((await handler(request({ bannerColor: "#aabbcc" }))).status, user ? 403 : 401);
  }
});
test("invalid JSON and invalid colors never overwrite a saved color", async () => {
  const handler = createProfileBannerHandler({ getUser: async () => ({ id: "me", role: { name: "student" }, studentProfile: {} }), updateBanner: async () => assert.fail("no write") });
  for (const body of [null, {}, { bannerColor: "url(x)" }, { bannerColor: "#fff" }]) assert.equal((await handler(request(body))).status, 400);
  assert.equal((await handler(new Request("http://local", { method: "PATCH", body: "{" }))).status, 400);
});
test("title text remains readable for both dark and light banner colors", () => {
  assert.equal(getBannerTextColor("#000000"), "#ffffff");
  assert.equal(getBannerTextColor("#ffffff"), "#000000");
});
