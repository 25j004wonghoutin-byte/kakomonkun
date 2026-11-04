import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationClient } from "../src/lib/notifications/client.ts";
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const pause = () => new Promise(resolve => setImmediate(resolve));
const result = (ownerId, readAt = "2026-11-04T10:00:00.000Z") => ({ ownerId, readAt, updatedCount: 1, unreadCount: 0 });
function owner(client, id) { assert.equal(typeof client.setOwner, "function"); return client.setOwner(id); }

test("owner change while the bell remains mounted isolates late counts, cutoffs, and stale cleanup", async () => {
  const old = deferred(), eventsA = [], eventsB = [];
  const client = createNotificationClient(async url => url.endsWith("read-all") ? old.promise : Response.json({ ownerId: "b", unreadCount: 3 }));
  const a = owner(client, "a"), stopA = a.subscribe(value => eventsA.push(value));
  const pending = a.openInbox({}); const rejected = assert.rejects(pending, /owner/i);
  const b = owner(client, "b"); b.subscribe(value => eventsB.push(value)); stopA();
  await b.refreshUnreadCount(); old.resolve(Response.json(result("a"))); await rejected;
  assert.deepEqual(eventsA, []); assert.deepEqual(eventsB, [{ unreadCount: 3 }]);
  await assert.rejects(a.loadPage("older"), /owner/i); assert.equal(b.isCurrent(), true);
});

test("old-owner pagination rejects even when the server serves the newly authenticated owner", async () => {
  const old = deferred();
  const client = createNotificationClient(async () => old.promise);
  const a = owner(client, "a"); const request = a.loadPage("older"), rejected = assert.rejects(request, /owner/i);
  const b = owner(client, "b"); old.resolve(Response.json({ ownerId: "b", notifications: [{ id: "b-private", readAt: null, createdAt: "2026-11-04T09:00:00Z" }], unreadCount: 1, nextCursor: null }));
  await rejected; assert.equal(b.isCurrent(), true);
});

test("response owner metadata prevents mixed rows before identity refresh observes the account switch", async () => {
  const client = createNotificationClient(async () => Response.json({ ownerId: "b", notifications: [{ id: "b-private" }], unreadCount: 1, nextCursor: null }));
  const a = owner(client, "a"), events = []; a.subscribe(value => events.push(value));
  await assert.rejects(a.loadPage("older"), /owner/i); assert.deepEqual(events, []);
});

test("a genuine reopen uses a fresh mutation despite a retained bell and pending prior opening", async () => {
  const first = deferred(), second = deferred(), sent = [];
  const client = createNotificationClient(async (url, options) => { sent.push([url, options.method]); return sent.length === 1 ? first.promise : second.promise; });
  const scope = client.setOwner ? client.setOwner("a") : client;
  const stopBell = scope.subscribe(() => {}), stopInbox = scope.subscribe(() => {});
  const openingA = {}, a = scope.openInbox(openingA); const replay = scope.openInbox(openingA); await pause(); stopInbox();
  const b = scope.openInbox({}); first.resolve(Response.json(result("a"))); await a; await replay; await pause();
  assert.equal(sent.length, 2);
  second.resolve(Response.json(result("a", "2026-11-04T10:00:02.000Z"))); const latest = await b;
  assert.equal(latest.readAt, "2026-11-04T10:00:02.000Z"); stopBell();
});

test("concurrent new openings and individual reads serialize and retain the newest confirmed cutoff", async () => {
  let calls = 0;
  const client = createNotificationClient(async url => {
    calls++; if (url.endsWith("read-all")) return Response.json(result("a", calls === 1 ? "2026-11-04T10:00:00.000Z" : "2026-11-04T10:00:02.000Z"));
    if (url.endsWith("/read")) return Response.json({ ownerId: "a", status: "changed" });
    if (url.endsWith("unread-count")) return Response.json({ ownerId: "a", unreadCount: 0 });
    return Response.json({ ownerId: "a", notifications: [{ id: "between", createdAt: "2026-11-04T10:00:01.000Z", readAt: null }], unreadCount: 1, nextCursor: null });
  });
  const scope = owner(client, "a"); await Promise.all([scope.openInbox({}), scope.markRead("one"), scope.openInbox({})]);
  const page = await scope.loadPage(); assert.equal(page.notifications[0].readAt, "2026-11-04T10:00:02.000Z");
});
