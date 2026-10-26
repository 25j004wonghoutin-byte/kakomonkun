import test from "node:test";
import assert from "node:assert/strict";
import { createMeHandler, getOwnedTitleCount } from "../src/lib/me.ts";

const profile = { totalPoints: 12, avatarUrl: null, totalPracticeCount: 2, totalCorrectCount: 5, totalAnswerCount: 8 };
const student = { id: "student-1", displayName: "あおい", role: { name: "student" }, studentProfile: { ...profile, internalField: "not-public" } };

test("counts only active ownership for the current user", async () => {
  let where;
  const db = { userTitle: { count: async (input) => { where = input.where; return 4; } } };
  assert.equal(await getOwnedTitleCount(db, student.id), 4);
  assert.deepEqual(where, { userId: student.id, title: { isActive: true } });
});

test("me preserves fields and adds owned count", async () => {
  const response = await createMeHandler({ getUser: async () => student, countOwnedTitles: async (id) => { assert.equal(id, student.id); return 4; } })();
  assert.deepEqual(await response.json(), { id: student.id, displayName: "あおい", role: "student", profile: { ...profile, ownedTitleCount: 4 } });
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vary"), "Cookie");
});

test("anonymous and teacher do not count titles", async () => {
  let calls = 0;
  const countOwnedTitles = async () => { calls++; return 99; };
  const anonymous = await createMeHandler({ getUser: async () => null, countOwnedTitles })();
  assert.equal(anonymous.status, 401);
  const teacher = await createMeHandler({ getUser: async () => ({ ...student, displayName: "変更できない名前", role: { name: "teacher" } }), countOwnedTitles })();
  assert.deepEqual(await teacher.json(), { id: student.id, displayName: "管理者", role: "teacher", profile: null });
  assert.equal(calls, 0);
});

test("missing student profile stays null without qualification writes", async () => {
  const response = await createMeHandler({ getUser: async () => ({ ...student, studentProfile: null }), countOwnedTitles: async () => { throw new Error("must not count"); } })();
  assert.equal((await response.json()).profile, null);
});
