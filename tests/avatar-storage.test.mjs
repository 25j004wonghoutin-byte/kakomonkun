import assert from "node:assert/strict";
import test from "node:test";

let contract = {}, configuration = {}, adapter = {};
try { contract = await import("../src/lib/avatars/contract.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
try { configuration = await import("../src/lib/avatars/storage-config.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
try { adapter = await import("../src/lib/avatars/storage.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
const userId = "11111111-1111-4111-8111-111111111111";
const version = "22222222-2222-4222-8222-222222222222";
const key = `${userId}/${version}.webp`;
const url = `/api/avatars/${userId}/${version}`;
const project = "grzylombpqmidltnbwhx";
const env = () => ({ NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`, SUPABASE_SECRET_KEY: "sb_secret_fixture" });
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.fixture`;

test("avatar references resolve only a canonical same-origin owner/version", () => {
  assert.equal(typeof contract.parseAvatarUrl, "function");
  assert.deepEqual(contract.parseAvatarUrl(url), { userId, version, key, url });
  assert.deepEqual(contract.createAvatarRef(userId, version), { userId, version, key, url });
});
for (const value of [null, undefined, "", "https://example.com/image.webp", `//example.com${url}`, `${url}?q=1`, `${url}#x`, `${url}/`, url.replace("/avatars/", "/avatars/../"), url.replace("/avatars/", "/avatars%2f"), url.replace(version, "not-a-uuid")]) {
  test(`avatar reference rejects ${String(value)}`, () => {
    assert.equal(typeof contract.parseAvatarUrl, "function");
    assert.equal(contract.parseAvatarUrl(value), null);
  });
}
test("storage config uses server secret precedence and validates legacy project binding", () => {
  assert.equal(typeof configuration.getAvatarStorageConfig, "function");
  assert.equal(configuration.getAvatarStorageConfig({ ...env(), SUPABASE_SERVICE_ROLE_KEY: "wrong" }).secret, "sb_secret_fixture");
  const legacy = jwt({ role: "service_role", ref: project });
  assert.equal(configuration.getAvatarStorageConfig({ ...env(), SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: legacy }).secret, legacy);
  for (const input of [
    { ...env(), SUPABASE_SECRET_KEY: "sb_publishable_DO_NOT_LOG" },
    { ...env(), NEXT_PUBLIC_SUPABASE_URL: "https://example.com" },
    { ...env(), NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co/path` },
    { ...env(), SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "anon", ref: project }) },
    { ...env(), SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref: "other" }) },
    { NEXT_PUBLIC_SUPABASE_URL: env().NEXT_PUBLIC_SUPABASE_URL },
  ]) assert.throws(() => configuration.getAvatarStorageConfig(input), (e) => e.status === 503 && !String(e).includes("DO_NOT_LOG"));
});
test("storage uploads do not overwrite and never expose a public or signed URL", async () => {
  assert.equal(typeof adapter.createAvatarStorage, "function");
  const requests = [];
  const storage = adapter.createAvatarStorage({ url: env().NEXT_PUBLIC_SUPABASE_URL, secret: "sb_secret_fixture" }, async (input, init) => {
    requests.push({ url: String(input), init });
    return Response.json({ Key: `student-avatars/${key}`, Id: version });
  });
  assert.equal(await storage.put(key, new Uint8Array([1, 2])), undefined);
  assert.equal(requests.length, 1);
  assert.equal(new Headers(requests[0].init.headers).get("x-upsert"), "false");
  assert.equal(requests[0].url, `${env().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/student-avatars/${key}`);
  assert.equal(requests[0].init.cache, "no-store");
  await assert.rejects(() => storage.put("../another-bucket/file.webp", new Uint8Array([1])));
  assert.equal(requests.length, 1);
});
test("storage retrieval distinguishes missing objects from unavailable service without exposing credentials", async () => {
  assert.equal(typeof adapter.createAvatarStorage, "function");
  for (const status of [404, 500]) {
    const storage = adapter.createAvatarStorage({ url: env().NEXT_PUBLIC_SUPABASE_URL, secret: "sb_secret_fixture" }, async () => Response.json({ statusCode: String(status), error: "DO_NOT_LOG", message: "DO_NOT_LOG" }, { status }));
    if (status === 404) assert.equal(await storage.get(key), null);
    else await assert.rejects(() => storage.get(key), (e) => e.status === 503 && !String(e).includes("DO_NOT_LOG"));
  }
});
test("storage listing walks owner folders and pages without returning malformed keys", async () => {
  assert.equal(typeof adapter.createAvatarStorage, "function");
  const offsets = [];
  const storage = adapter.createAvatarStorage({ url: env().NEXT_PUBLIC_SUPABASE_URL, secret: "sb_secret_fixture" }, async (_input, init) => {
    const body = JSON.parse(init.body);
    offsets.push([body.prefix, body.offset]);
    if (!body.prefix) return Response.json(body.offset ? [] : [{ name: userId, id: null }, { name: "bad-folder", id: null }]);
    const data = Array.from({ length: 100 }, (_, i) => ({ name: `${String(i + 1).padStart(8, "0")}-2222-4222-8222-222222222222.webp`, id: version, created_at: "2026-10-10T00:00:00Z" }));
    return Response.json(body.offset === 0 ? data : [{ name: `${version}.webp`, id: version, created_at: "2026-10-10T00:00:00Z" }, { name: `${userId}.webp`, id: userId, created_at: null }, { name: "foreign.txt", id: "x" }]);
  });
  const items = [];
  for await (const item of storage.list()) items.push(item);
  assert.equal(items.length, 101);
  assert.equal(items.at(-1).key, key);
  assert.deepEqual(offsets, [["", 0], [userId, 0], [userId, 100]]);
});
