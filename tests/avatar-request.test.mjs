import assert from "node:assert/strict";
import test from "node:test";
let api = {};
try { api = await import("../src/lib/avatars/request.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
const endpoint = "https://app.example/api/profile/avatar";
function form(size = 3, expected = '"https://legacy.example/avatar.png"') {
  const data = new FormData();
  data.set("image", new Blob([new Uint8Array(size)], { type: "image/webp" }), "crop.webp");
  data.set("expectedAvatarUrl", expected);
  return data;
}
test("avatar upload retains the raw legacy expectation and accepts the image byte boundary", async () => {
  assert.equal(typeof api.readAvatarUpload, "function");
  const value = await api.readAvatarUpload(new Request(endpoint, { method: "POST", body: form(2 * 1024 * 1024) }));
  assert.equal(value.image.byteLength, 2 * 1024 * 1024);
  assert.equal(value.expectedAvatarUrl, "https://legacy.example/avatar.png");
});
test("avatar upload rejects missing duplicated extra and malformed fields", async () => {
  assert.equal(typeof api.readAvatarUpload, "function");
  const cases = [
    d => d.append("image", new Blob(["x"]), "x.webp"), d => d.append("expectedAvatarUrl", "null"),
    d => d.delete("image"), d => d.delete("expectedAvatarUrl"), d => d.set("userId", "someone-else"),
    d => d.set("expectedAvatarUrl", "{}"), d => d.set("expectedAvatarUrl", "broken"),
  ];
  for (const mutate of cases) {
    const data = form(); mutate(data);
    await assert.rejects(() => api.readAvatarUpload(new Request(endpoint, { method: "POST", body: data })), e => e.status === 400);
  }
  await assert.rejects(() => api.readAvatarUpload(new Request(endpoint, { method: "POST", body: form(2 * 1024 * 1024 + 1) })), e => e.status === 413);
});
test("avatar body limit counts streamed bytes without trusting Content-Length and cancels reading", async () => {
  assert.equal(typeof api.readAvatarUpload, "function");
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(65536)); }, cancel() { cancelled = true; } });
  const request = new Request(endpoint, { method: "POST", body: stream, duplex: "half", headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "1" } });
  await assert.rejects(() => api.readAvatarUpload(request), e => e.status === 413);
  assert.equal(cancelled, true);
});
test("avatar delete accepts only a raw string or null expectation within the size limit", async () => {
  assert.equal(typeof api.readAvatarDelete, "function");
  const request = body => new Request(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body });
  assert.deepEqual(await api.readAvatarDelete(request('{"expectedAvatarUrl":null}')), { expectedAvatarUrl: null });
  for (const body of ['{}', '{"expectedAvatarUrl":4}', '{"expectedAvatarUrl":null,"userId":"other"}', 'broken']) {
    await assert.rejects(() => api.readAvatarDelete(request(body)), e => e.status === 400);
  }
  await assert.rejects(() => api.readAvatarDelete(request(" ".repeat(65537))), e => e.status === 413);
});
