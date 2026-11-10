import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server.js";
import { existingUser, googleUser, harness, loadLoginPage, loadSessionProxy } from "./helpers/google-auth-harness.mjs";

// Render the real production page; the development-only form needs a live router.
process.env.NODE_ENV = "production";

test("domain refusal is explained distinctly from a generic OAuth failure", async () => {
  harness();
  const LoginPage = loadLoginPage();
  const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error: "google_domain_not_allowed", next: "/board" }) }));
  assert.match(html, /role="alert"/); assert.match(html, /edu\.kimura\.ac\.jp/); assert.match(html, /新規/);
  assert.doesNotMatch(html, /ログイン処理を完了できませんでした。/);
  const generic = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error: "auth_callback_failed" }) }));
  assert.match(generic, /ログイン処理を完了できませんでした。/);
});

test("a Supabase-only outside account can reach login without repeated home redirects", async () => {
  const h = harness();
  const response = await loadSessionProxy()(new NextRequest("https://app.example/login"));
  assert.equal(response.headers.get("location"), null);
  const html = renderToStaticMarkup(await loadLoginPage()({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Googleでログイン/); assert.equal(h.state.users.length, 0); assert.deepEqual(h.state.writes, []);
});

test("already registered outside-domain accounts still redirect from login to home", async () => {
  harness({ authUser: googleUser("legacy@example.com", "auth-existing"), users: [existingUser()] });
  await assert.rejects(loadLoginPage()({ searchParams: Promise.resolve({}) }), error => error.digest?.includes("NEXT_REDIRECT;replace;/;"));
});
