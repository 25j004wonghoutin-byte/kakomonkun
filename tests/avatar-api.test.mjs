import assert from "node:assert/strict";
import test from "node:test";
let api = {};
try { api = await import("../src/lib/avatars/handlers.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
const userId = "11111111-1111-4111-8111-111111111111", version = "22222222-2222-4222-8222-222222222222";
const url = `https://app.example/api/avatars/${userId}/${version}`;
const actor = role => ({ id: userId, role: { name: role }, status: "active", deletedAt: null });
function make(user = actor("student")) {
  assert.equal(typeof api.createAvatarHandlers, "function");
  const calls = [];
  const service = {
    async save(input) { calls.push(["save", input]); return { avatarUrl: `/api/avatars/${userId}/${version}` }; },
    async remove(input) { calls.push(["remove", input]); return { avatarUrl: null }; },
    async read(ref) { calls.push(["read", ref]); return new Uint8Array([1, 2, 3]); },
  };
  const handlers = api.createAvatarHandlers({ getUser: async () => user, service, normalizeImage: async bytes => bytes });
  return { handlers, calls, service };
}
const mutation = (origin = "https://app.example", extra = false) => {
  const form = new FormData(); form.set("image", new Blob(["image"]), "a.webp"); form.set("expectedAvatarUrl", "null");
  if (extra) form.set("userId", "victim");
  return new Request("https://app.example/api/profile/avatar", { method: "POST", body: form, headers: origin ? { origin } : {} });
};
test("anonymous and inactive avatar requests do not consume mutation bodies or access storage", async () => {
  for (const user of [null, { ...actor("student"), status: "inactive" }, { ...actor("student"), deletedAt: new Date() }]) {
    const { handlers, calls } = make(user); const request = mutation();
    const denied = await handlers.post(request);
    assert.equal(denied.status, 401); assert.equal(request.bodyUsed, false);
    for (const method of ["GET", "HEAD"]) {
      const response = await handlers.image(new Request(url, { method, headers: { range: "bytes=0-1", "if-none-match": "some-etag" } }), { userId, version });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
      assert.equal(response.headers.get("vary"), "Cookie");
      if (method === "HEAD") assert.equal(await response.text(), "");
    }
    assert.equal(calls.length, 0);
  }
});
test("teachers can retrieve images but cannot upload or delete and other roles cannot view", async () => {
  const { handlers, calls } = make(actor("teacher"));
  assert.equal((await handlers.post(mutation())).status, 403);
  assert.equal((await handlers.remove(new Request("https://app.example/api/profile/avatar", { method: "DELETE" }))).status, 403);
  for (const method of ["GET", "HEAD"]) {
    const response = await handlers.image(new Request(url, { method, headers: { range: "bytes=0-1", "if-none-match": "etag" } }), { userId, version });
    assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await response.arrayBuffer()).byteLength, method === "HEAD" ? 0 : 3);
  }
  assert.equal(calls.filter(c => c[0] === "read").length, 2);
  assert.equal((await make(actor("other")).handlers.image(new Request(url), { userId, version })).status, 403);
});
test("avatar mutation requires exact Origin and derives owner from the authenticated user", async () => {
  const { handlers, calls } = make();
  for (const origin of [null, "https://evil.example", "https://app.example.evil.example"]) {
    const request = mutation(origin); assert.equal((await handlers.post(request)).status, 403); assert.equal(request.bodyUsed, false);
  }
  assert.equal((await handlers.post(mutation(undefined, true))).status, 400);
  assert.equal((await handlers.post(mutation())).status, 200);
  assert.equal(calls[0][1].userId, userId);
});
test("stale missing malformed references are 404 and internal failures are safe no-store responses", async () => {
  const { handlers, service } = make();
  service.read = async () => null;
  assert.equal((await handlers.image(new Request(url), { userId, version })).status, 404);
  assert.equal((await handlers.image(new Request(url), { userId: "bad", version })).status, 404);
  service.read = async () => { throw new Error("DO_NOT_LOG-secret-db-password"); };
  const error = await handlers.image(new Request(url), { userId, version });
  assert.equal(error.status, 500); assert.equal(error.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal((await error.text()).includes("DO_NOT_LOG"), false);
});

test("same-origin avatar uploads respect the request Host when Next uses an internal localhost URL", async () => {
  const {handlers}=make();
  function request(host){const form=new FormData();form.set("image",new Blob(["crop"]),"a.webp");form.set("expectedAvatarUrl","null");return new Request("http://localhost:3001/api/profile/avatar",{method:"POST",headers:{origin:"http://127.0.0.1:3001",host,"x-forwarded-host":"evil.example"},body:form});}
  assert.equal((await handlers.post(request("127.0.0.1:3001"))).status,200);
  for(const host of ["evil.example","127.0.0.1:3001@evil.example","127.0.0.1:3001/path"])assert.equal((await handlers.post(request(host))).status,403);
});
