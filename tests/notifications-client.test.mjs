import test from "node:test";
import assert from "node:assert/strict";
let clientModule = {};
try { clientModule = await import("../src/lib/notifications/client.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const readAll = { ownerId: "student", updatedCount: 5, unreadCount: 2, readAt: "2026-11-04T10:00:00.000Z" };
const page = { ownerId: "student", notifications: [
  { id: "old", readAt: null, createdAt: "2026-11-04T09:00:00.000Z" },
  { id: "read", readAt: "2026-11-03T00:00:00.000Z", createdAt: "2026-11-02T00:00:00.000Z" },
  { id: "new", readAt: null, createdAt: "2026-11-04T10:00:00.001Z" },
], unreadCount: 9, nextCursor: "next" };
function setup(send) { assert.equal(typeof clientModule.createNotificationClient, "function"); const client = clientModule.createNotificationClient(send).setOwner("student"), events = []; client.subscribe(event => events.push(event)); return { client, events }; }

test("creating the inbox client for server rendering or prefetch never writes", () => {
  const sent = []; setup((...args) => { sent.push(args); }); assert.deepEqual(sent, []);
});

test("duplicate opening shares one PATCH and uses the real unread count including new arrivals", async () => {
  const pending = deferred(), sent = [];
  const { client, events } = setup(async (url, options) => { sent.push([url, options.method]); return pending.promise; });
  const token = {};
  const first = client.openInbox(token), second = client.openInbox(token), bell = client.refreshUnreadCount();
  assert.deepEqual(sent, [["/api/notifications/read-all", "PATCH"]]); assert.deepEqual(events, []);
  pending.resolve(Response.json(readAll)); await Promise.all([first, second, bell]);
  assert.deepEqual(events, [{ unreadCount: 2, readAt: readAll.readAt }]);
});

test("a stale bell request cannot resurrect an unread badge after bulk-read success", async () => {
  const oldCount = deferred();
  const { client, events } = setup(async url => url.endsWith("unread-count") ? oldCount.promise : Response.json(readAll));
  const firstBell = client.refreshUnreadCount(), secondBell = client.refreshUnreadCount();
  await client.openInbox({}); oldCount.resolve(Response.json({ ownerId: "student", unreadCount: 7 })); await Promise.all([firstBell, secondBell]);
  assert.deepEqual(events, [{ unreadCount: 2, readAt: readAll.readAt }]);
});

test("a failed bulk read preserves unread state and retry performs a fresh request", async () => {
  let attempts = 0;
  const { client, events } = setup(async url => {
    if (url.endsWith("unread-count")) return Response.json({ ownerId: "student", unreadCount: 7 });
    return ++attempts === 1 ? Response.json({ error: "offline" }, { status: 500 }) : Response.json(readAll);
  });
  await client.refreshUnreadCount(); await assert.rejects(client.openInbox({}));
  assert.deepEqual(events, [{ unreadCount: 7 }]);
  await client.openInbox({}); assert.equal(attempts, 2); assert.deepEqual(events.at(-1), { unreadCount: 2, readAt: readAll.readAt });
});

test("stale pagination preserves cutoff reads and old timestamps without reading new arrivals", async () => {
  const olderPage = deferred();
  const { client, events } = setup(async url => url.includes("read-all") ? Response.json(readAll) : olderPage.promise);
  const request = client.loadPage("older"); await client.openInbox({}); olderPage.resolve(Response.json(page));
  const loaded = await request;
  assert.equal(loaded.notifications[0].readAt, readAll.readAt); assert.equal(loaded.notifications[1].readAt, "2026-11-03T00:00:00.000Z");
  assert.equal(loaded.notifications[2].readAt, null); assert.equal(loaded.unreadCount, 2); assert.equal(loaded.nextCursor, "next");
  assert.deepEqual(events, [{ unreadCount: 2, readAt: readAll.readAt }]);
});

test("multiple bells share one count request and individual read still synchronizes its actual count", async () => {
  const count = deferred(), sent = [];
  const { client, events } = setup(async (url, options) => { sent.push([url, options.method ?? "GET"]); return url.endsWith("/read") ? Response.json({ ownerId: "student", status: "changed" }) : (await count.promise).clone(); });
  const a = client.refreshUnreadCount(), b = client.refreshUnreadCount(); count.resolve(Response.json({ ownerId: "student", unreadCount: 3 })); await Promise.all([a, b]);
  const stop = client.subscribe(() => {}); stop();
  await client.markRead("owned");
  assert.deepEqual(sent, [["/api/notifications/unread-count", "GET"], ["/api/notifications/owned/read", "PATCH"], ["/api/notifications/unread-count", "GET"]]);
  assert.equal(events.at(-1).unreadCount, 3);
});


test("a page completed during bulk read waits for its confirmed cutoff before exposing rows", async () => {
  const pendingRead = deferred(), pendingPage = deferred();
  const { client } = setup(async url => url.endsWith("read-all") ? pendingRead.promise : pendingPage.promise);
  let exposed = false;
  const pageRequest = client.loadPage("older").then(value => { exposed = true; return value; });
  const opening = client.openInbox({}); pendingPage.resolve(Response.json(page));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(exposed, false);
  pendingRead.resolve(Response.json(readAll)); await opening;
  const loaded = await pageRequest; assert.equal(loaded.notifications[0].readAt, readAll.readAt); assert.equal(loaded.notifications[2].readAt, null);
});
