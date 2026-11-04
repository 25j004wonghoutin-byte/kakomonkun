import test from "node:test";
import assert from "node:assert/strict";
let write = {}, handler = {};
try { write = await import("../src/lib/notifications/write.ts"); } catch (error) { throw error; }
try { handler = await import("../src/lib/notifications/read-all-handler.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const cutoff = new Date("2026-11-04T10:00:00.000Z");

function database() {
  const oldReadAt = new Date("2026-11-03T00:00:00.000Z");
  const rows = [
    { id: "mine", recipientId: "student", readAt: null, createdAt: new Date("2026-11-04T09:00:00Z") },
    { id: "boundary", recipientId: "student", readAt: null, createdAt: cutoff },
    { id: "old", recipientId: "student", readAt: oldReadAt, createdAt: new Date("2026-11-02T00:00:00Z") },
    { id: "other", recipientId: "teacher", readAt: null, createdAt: cutoff },
    { id: "new", recipientId: "student", readAt: null, createdAt: new Date("2026-11-04T10:00:00.001Z") },
  ];
  const matches = (row, where) => row.recipientId === where.recipientId && (where.readAt !== null || row.readAt === null) && (!where.createdAt?.lte || row.createdAt <= where.createdAt.lte);
  const queries = [];
  const tx = { notification: {
    async updateMany({ where, data }) { queries.push(where); let count = 0; for (const row of rows) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
    async count({ where }) { return rows.filter(row => matches(row, where)).length; },
  } };
  return { tx, rows, oldReadAt, queries };
}

test("bulk read changes only owned unread rows through the inclusive server cutoff", async () => {
  assert.equal(typeof write.markAllNotificationsReadInTransaction, "function");
  const f = database();
  const result = await write.markAllNotificationsReadInTransaction(f.tx, "student", cutoff);
  assert.deepEqual(result, { updatedCount: 2, unreadCount: 1, readAt: "2026-11-04T10:00:00.000Z" });
  assert.deepEqual(f.queries[0], { recipientId: "student", readAt: null, createdAt: { lte: cutoff } });
  assert.equal(f.rows[0].readAt, cutoff); assert.equal(f.rows[1].readAt, cutoff);
  assert.equal(f.rows[2].readAt, f.oldReadAt); assert.equal(f.rows[3].readAt, null); assert.equal(f.rows[4].readAt, null);
  const repeat = await write.markAllNotificationsReadInTransaction(f.tx, "student", cutoff);
  assert.equal(repeat.updatedCount, 0); assert.equal(repeat.unreadCount, 1);
});

test("an arrival during the update is retained in the returned unread count", async () => {
  assert.equal(typeof write.markAllNotificationsReadInTransaction, "function");
  const f = database(), update = f.tx.notification.updateMany;
  f.tx.notification.updateMany = async args => { const result = await update(args); f.rows.push({ id: "arrival", recipientId: "student", readAt: null, createdAt: new Date("2026-11-04T10:00:01Z") }); return result; };
  const result = await write.markAllNotificationsReadInTransaction(f.tx, "student", cutoff);
  assert.equal(result.unreadCount, 2); assert.equal(f.rows.at(-1).readAt, null);
});

test("bulk endpoint derives recipient from auth, supports teacher and student, and sends private responses", async () => {
  assert.equal(typeof handler.createNotificationReadAllHandler, "function");
  for (const role of ["student", "teacher"]) {
    const owners = [];
    const patch = handler.createNotificationReadAllHandler({ getUser: async () => ({ id: role, role: { name: role } }), markAllRead: async owner => { owners.push(owner); return { updatedCount: 2, unreadCount: 1, readAt: cutoff.toISOString() }; } });
    const response = await patch(new Request("https://app.example/api/notifications/read-all?recipientId=other", { method: "PATCH", body: JSON.stringify({ recipientId: "other", cutoff: "2999-01-01" }) }));
    assert.equal(response.status, 200); assert.deepEqual(owners, [role]);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(response.headers.get("vary"), "Cookie");
    assert.deepEqual(await response.json(), { updatedCount: 2, unreadCount: 1, readAt: cutoff.toISOString(), ownerId: role });
  }
});

test("unauthenticated bulk read never writes and a failed write is not reported as read", async () => {
  assert.equal(typeof handler.createNotificationReadAllHandler, "function");
  let writes = 0;
  const patch = handler.createNotificationReadAllHandler({ getUser: async () => null, markAllRead: async () => { writes++; } });
  assert.equal((await patch()).status, 401); assert.equal(writes, 0);
  const failed = handler.createNotificationReadAllHandler({ getUser: async () => ({ id: "student" }), markAllRead: async () => { throw Error("private-database-error"); } });
  const response = await failed(); assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /private-database-error|updatedCount|readAt/);
});
