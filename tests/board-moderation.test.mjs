import "./helpers/register-title-tests.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const student = { id: "00000000-0000-4000-8000-000000000001", roleName: "student" };
const postId = "00000000-0000-4000-8000-000000000002";
const teacherId = "00000000-0000-4000-8000-000000000003";

test("the report destination is the teacher's report queue", async () => {
  const { notificationTarget } = await import("../src/lib/notifications/contract.ts");
  assert.equal(notificationTarget({ type: "board_report", postId: null }), "/teacher/board-reports");
});

test("submitting the same pending report twice notifies teachers only once, without an actor", async () => {
  const { reportBoardPostInTransaction } = await import("../src/lib/board/reports.ts");
  let report;
  const notices = [];
  const tx = {
    boardPost: { findFirst: async () => ({ id: postId }) },
    boardReport: { createManyAndReturn: async ({ data }) => {
      if (report) return [];
      report = data[0];
      return [{ id: "report-id" }];
    } },
    user: { findMany: async () => [{ id: teacherId }] },
    notification: { createMany: async ({ data }) => { notices.push(...data); } },
  };
  assert.equal(await reportBoardPostInTransaction(tx, student, postId, "spam"), "accepted");
  assert.equal(await reportBoardPostInTransaction(tx, student, postId, "spam"), "accepted");
  assert.deepEqual(report, { postId, reason: "spam" });
  assert.deepEqual(notices, [{ recipientId: teacherId, type: "board_report", boardReportId: "report-id" }]);
  assert.equal(await reportBoardPostInTransaction(tx, { id: teacherId, roleName: "teacher" }, postId, "spam"), "forbidden");
});

test("a restriction blocks a student write until the expiry boundary", async () => {
  const { runBoardWriteInTransaction } = await import("../src/lib/board/restrictions.ts");
  const expiresAt = new Date("2026-11-19T01:00:00Z");
  const tx = {
    $queryRaw: async () => [{ id: student.id }],
    boardRestriction: { findUnique: async () => ({ expiresAt }) },
  };
  let writes = 0;
  const write = async () => ++writes;
  assert.equal(await runBoardWriteInTransaction(tx, student, write, () => new Date(+expiresAt - 1)), "restricted");
  assert.equal(writes, 0);
  assert.equal(await runBoardWriteInTransaction(tx, student, write, () => expiresAt), 1);
});

test("teacher date entry is validated as Japan time, including calendar dates", async () => {
  const { parseRestrictionExpiry } = await import("../src/lib/board/moderation-contract.ts");
  const now = new Date("2026-11-18T03:00:00Z");
  assert.equal(parseRestrictionExpiry("2026-11-18T12:01", now)?.toISOString(), "2026-11-18T03:01:00.000Z");
  assert.equal(parseRestrictionExpiry("2026-11-18T12:00", now), null);
  assert.equal(parseRestrictionExpiry("2026-11-31T12:01", now), null);
});
