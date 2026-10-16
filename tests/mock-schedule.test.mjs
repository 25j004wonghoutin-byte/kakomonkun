import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const moduleUrl = new URL("../src/lib/mock-exams/schedule.ts", import.meta.url);
const schedule = async () => {
  assert.ok(existsSync(moduleUrl), "mock exam schedule implementation is required");
  return import(moduleUrl.href);
};

// Catches UTC/local-time boundaries replacing the agreed JST instants.
for (const [month, opens, closes, reminder] of [
  ["2026-10", "2026-09-30T15:00:00.000Z", "2026-10-24T15:00:00.000Z", "2026-10-20T00:00:00.000Z"],
  ["2024-02", "2024-01-31T15:00:00.000Z", "2024-02-24T15:00:00.000Z", "2024-02-20T00:00:00.000Z"],
  ["2026-12", "2026-11-30T15:00:00.000Z", "2026-12-24T15:00:00.000Z", "2026-12-20T00:00:00.000Z"],
  ["2027-01", "2026-12-31T15:00:00.000Z", "2027-01-24T15:00:00.000Z", "2027-01-20T00:00:00.000Z"],
]) {
  test(`${month}: opening, exclusive cutoff and reminder use JST`, async () => {
    const { getMockSchedule } = await schedule();
    const result = getMockSchedule(month);
    assert.equal(result.month, month);
    assert.equal(result.opensAt.toISOString(), opens);
    assert.equal(result.closesAt.toISOString(), closes);
    assert.equal(result.reminderAt.toISOString(), reminder);
  });
}

test("a regular attempt receives the full policy time", async () => {
  const { getMockSchedule, getMockPolicy, getAttemptDeadline } = await schedule();
  const start = new Date("2026-10-02T03:00:00.000Z");
  const month = getMockSchedule("2026-10");
  assert.equal(getAttemptDeadline(start, month, getMockPolicy("it_passport").timeLimitMinutes).toISOString(), "2026-10-02T05:00:00.000Z");
  assert.equal(getAttemptDeadline(start, month, getMockPolicy("fe").timeLimitMinutes).toISOString(), "2026-10-02T04:30:00.000Z");
  assert.equal(start.toISOString(), "2026-10-02T03:00:00.000Z");
});

test("a late attempt is shortened to the exclusive 25th cutoff", async () => {
  const { getMockSchedule, getAttemptDeadline } = await schedule();
  const month = getMockSchedule("2026-10");
  for (const start of ["2026-10-24T14:30:00.000Z", "2026-10-24T14:59:59.999Z"]) {
    assert.equal(getAttemptDeadline(new Date(start), month, 90).toISOString(), "2026-10-24T15:00:00.000Z");
  }
  for (const start of ["2026-10-24T15:00:00.000Z", "2026-10-24T15:00:00.001Z", "2026-09-30T14:59:59.999Z"]) {
    assert.throws(() => getAttemptDeadline(new Date(start), month, 90), (e) => e.status === 409);
  }
  assert.equal(getAttemptDeadline(new Date("2026-09-30T15:00:00.000Z"), month, 90).toISOString(), "2026-09-30T16:30:00.000Z");
});

test("invalid calendar months cannot roll into a different monthly exam", async () => {
  const { getMockSchedule } = await schedule();
  for (const value of ["", "2026-00", "2026-13", "2026-2", "26-02", "0000-01", "2026-02-01", " 2026-10", "2026-10\n", null, 202610]) {
    assert.throws(() => getMockSchedule(value), (e) => e.status === 400);
  }
});

test("invalid start dates or durations never produce an unbounded deadline", async () => {
  const { getMockSchedule, getAttemptDeadline } = await schedule();
  const month = getMockSchedule("2026-10");
  for (const minutes of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => getAttemptDeadline(new Date("2026-10-02T03:00:00Z"), month, minutes), (e) => e.status === 400);
  }
  assert.throws(() => getAttemptDeadline(new Date(NaN), month, 90), (e) => e.status === 400);
});

test("unsupported exams are rejected rather than silently assigned another policy", async () => {
  const { getMockPolicy } = await schedule();
  for (const code of ["", "FE", "fe_b", "student", null]) assert.throws(() => getMockPolicy(code), (e) => e.status === 400);
});

test("each exam retains independent counts, limits and first-submission reward", async () => {
  const { getMockPolicy } = await schedule();
  assert.deepEqual(getMockPolicy("it_passport"), { questionCount: 100, timeLimitMinutes: 120, maxAttempts: 2, participationPoints: 20 });
  assert.deepEqual(getMockPolicy("fe"), { questionCount: 60, timeLimitMinutes: 90, maxAttempts: 2, participationPoints: 20 });
});
