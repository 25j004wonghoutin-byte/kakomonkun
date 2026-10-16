import { MockError, type ExamCode, type MockPolicy, type MockSchedule, type MonthKey } from "./contract";

const POLICIES: Readonly<Record<ExamCode, MockPolicy>> = Object.freeze({
  it_passport: Object.freeze({ questionCount: 100, timeLimitMinutes: 120, maxAttempts: 2, participationPoints: 20 }),
  fe: Object.freeze({ questionCount: 60, timeLimitMinutes: 90, maxAttempts: 2, participationPoints: 20 }),
});

export function getMockPolicy(code: ExamCode): MockPolicy {
  if (code !== "it_passport" && code !== "fe") {
    throw new MockError("invalid_exam", 400, "試験種別が正しくありません。");
  }
  return POLICIES[code];
}

export function getMockSchedule(month: MonthKey): MockSchedule {
  if (typeof month !== "string" || !/^(?!0000)[0-9]{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
    throw new MockError("invalid_month", 400, "対象月が正しくありません。");
  }
  return {
    month,
    opensAt: new Date(`${month}-01T00:00:00+09:00`),
    closesAt: new Date(`${month}-25T00:00:00+09:00`),
    reminderAt: new Date(`${month}-20T09:00:00+09:00`),
  };
}

export function getAttemptDeadline(startedAt: Date, schedule: MockSchedule, minutes: number): Date {
  const start = startedAt instanceof Date ? startedAt.getTime() : NaN;
  const opens = schedule.opensAt.getTime();
  const closes = schedule.closesAt.getTime();
  const timeLimit = minutes * 60_000;
  if (!Number.isFinite(start) || !Number.isFinite(opens) || !Number.isFinite(closes)
    || !Number.isSafeInteger(minutes) || minutes <= 0 || !Number.isSafeInteger(timeLimit)
    || !Number.isSafeInteger(start + timeLimit) || opens >= closes) {
    throw new MockError("invalid_deadline", 400, "受験日時または制限時間が正しくありません。");
  }
  if (start < opens || start >= closes) {
    throw new MockError("exam_closed", 409, "現在はこの模擬試験の受験期間外です。");
  }
  return new Date(Math.min(start + timeLimit, closes));
}
