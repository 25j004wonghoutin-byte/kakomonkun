import assert from "node:assert/strict";
import test from "node:test";
import { existingUser, googleUser, harness } from "./helpers/google-auth-harness.mjs";

test("new students with an exact school domain are provisioned with the existing profile flow", async () => {
  for (const email of ["new@edu.kimura.ac.jp", "UPPER@EDU.KIMURA.AC.JP"]) {
    const h = harness({ authUser: googleUser(email) });
    const user = await h.ensureAppUser(googleUser(email));
    assert.equal(user.email, email.toLowerCase());
    assert.equal(user.role.name, "student");
    assert.equal(user.studentProfile.currentTitleId, "starter-title");
    assert.equal(h.state.users.length, 1);
  }
});

test("new outside, lookalike and subdomain accounts never create an app user or write profile data", async () => {
  for (const email of ["new@gmail.com", "new@kimura.ac.jp", "new@sub.edu.kimura.ac.jp", "new@edu.kimura.ac.jp.evil.invalid", "new@notedu.kimura.ac.jp", "new@edu.kimura.ac.jp ", "fake@other@edu.kimura.ac.jp"]) {
    const authUser = googleUser(email);
    authUser.user_metadata.email = "fake@edu.kimura.ac.jp";
    const h = harness({ authUser });
    await assert.rejects(h.ensureAppUser(authUser), error => error.code === "google_domain_not_allowed");
    assert.equal(h.state.users.length, 0);
    assert.deepEqual(h.state.writes, []);
  }
});

test("an existing outside-domain account keeps its ID, name, title, points and biography", async () => {
  const original = existingUser();
  const h = harness({ users: [original] });
  const user = await h.ensureAppUser(googleUser("legacy@example.com", "auth-existing"));
  assert.equal(user.id, original.id);
  assert.equal(user.displayName, original.displayName);
  assert.deepEqual(user.studentProfile, original.studentProfile);
  assert.equal(h.state.users.length, 1);
  assert.equal(h.state.writes.filter(w => w.kind === "create").length, 0);
});

test("a pre-existing email without an auth ID can still link its Google account", async () => {
  const h = harness({ users: [existingUser({ authUserId: null })] });
  const user = await h.ensureAppUser(googleUser("legacy@example.com"));
  assert.equal(user.id, "app-existing"); assert.equal(user.authUserId, "auth-new"); assert.equal(h.state.users.length, 1);
});

test("grandfathered accounts do not bypass conflicting auth IDs or email links", async () => {
  const h = harness({ users: [existingUser()] });
  await assert.rejects(h.ensureAppUser(googleUser("legacy@example.com", "different-auth")), /linked to another account/);
  assert.deepEqual(h.state.writes, []);
  const h2 = harness({ users: [existingUser(), existingUser({ id: "other", email: "new@edu.kimura.ac.jp", authUserId: null })] });
  await assert.rejects(h2.ensureAppUser(googleUser("new@edu.kimura.ac.jp", "auth-existing")), /conflicts with an existing user/);
  assert.deepEqual(h2.state.writes, []);
});

test("the ordinary current-user fallback also refuses an outside-domain account", async () => {
  const h = harness();
  assert.equal(await h.getCurrentUser(), null); assert.deepEqual(h.state.writes, []);
});

test("current-user lookup preserves existing outside accounts and refuses inactive or deleted accounts", async () => {
  for (const patch of [{}, { status: "suspended" }, { deletedAt: new Date() }]) {
    const h = harness({ authUser: googleUser("legacy@example.com", "auth-existing"), users: [existingUser(patch)] });
    const user = await h.getCurrentUser();
    assert.equal(Boolean(user), !patch.status && !patch.deletedAt);
    assert.deepEqual(h.state.writes, []);
  }
});

test("school-domain OAuth callback provisions and returns to the original app page", async () => {
  const h = harness({ authUser: googleUser("new@edu.kimura.ac.jp") });
  const response = await h.callback(new Request("https://app.example/auth/callback?code=school&next=%2Fboard"));
  assert.equal(new URL(response.headers.get("location")).pathname, "/board");
  assert.equal(h.state.users.length, 1); assert.deepEqual(h.state.signOuts, []);
});

test("outside-domain OAuth callback signs out only this session and displays the domain refusal", async () => {
  const h = harness();
  const response = await h.callback(new Request("https://app.example/auth/callback?code=outside&next=%2Fboard"));
  const url = new URL(response.headers.get("location"));
  assert.equal(url.pathname, "/login"); assert.equal(url.searchParams.get("error"), "google_domain_not_allowed");
  assert.equal(url.searchParams.get("next"), "/board"); assert.deepEqual(h.state.signOuts, [{ scope: "local" }]);
  assert.deepEqual(h.state.writes, []); assert.equal(h.state.users.length, 0);
});

test("existing outside-domain OAuth callbacks remain successful", async () => {
  const h = harness({ authUser: googleUser("legacy@example.com", "auth-existing"), users: [existingUser()] });
  const response = await h.callback(new Request("https://app.example/auth/callback?code=legacy"));
  assert.equal(new URL(response.headers.get("location")).pathname, "/"); assert.deepEqual(h.state.signOuts, []);
});

test("a refused callback still reaches the refusal page when session cleanup throws", async () => {
  const h = harness({ signOutError: new Error("auth endpoint offline") });
  const response = await h.callback(new Request("https://app.example/auth/callback?code=outside"));
  const url = new URL(response.headers.get("location"));
  assert.equal(url.pathname, "/login"); assert.equal(url.searchParams.get("error"), "google_domain_not_allowed");
  assert.equal(h.state.users.length, 0);
});

test("missing OAuth code and failed exchange cannot provision any app user", async () => {
  for (const url of ["https://app.example/auth/callback", "https://app.example/auth/callback?code=bad"]) {
    const h = harness({ exchangeError: new Error("invalid code") });
    const response = await h.callback(new Request(url));
    assert.equal(new URL(response.headers.get("location")).searchParams.get("error"), "auth_callback_failed");
    assert.deepEqual(h.state.writes, []);
  }
});

test("OAuth return targets stay on the app origin, including backslash and control-character inputs", async () => {
  for (const next of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\tevil.invalid", "/\nevil.invalid"]) {
    const h = harness({ authUser: googleUser("new@edu.kimura.ac.jp") });
    const response = await h.callback(new Request("https://app.example/auth/callback?code=school&next=" + encodeURIComponent(next)));
    assert.equal(response.headers.get("location"), "https://app.example/");
  }
});
