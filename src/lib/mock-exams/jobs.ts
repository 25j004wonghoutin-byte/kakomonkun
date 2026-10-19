import { randomUUID } from "node:crypto";
import type { PrismaClient, MockExamJobRun } from "../../../prisma/generated/client";
import { MockError, type MockClock, type ExamCode } from "./contract";
import { readMockEnvironment } from "./environment";
import { dbNow } from "./locks";
import { getTokyoDate } from "../tokyo-date";
import { getMockSchedule } from "./schedule";
import { settleExpiredMockAttempts } from "./ranking";
import { prepareMockExam } from "./prepare";
import { sendMockRemindersBatch } from "./reminders";
import { settleMockExamBatch } from "./settlement";

const options = { maxWait: 10000, timeout: 30000 };
const retryMinutes = [1, 5, 15, 60];
type Outcome = { done: boolean; cursor?: string | null; errorCode?: string };
function validNow(now: Date) { if (!Number.isFinite(+now)) throw new MockError("invalid_clock", 503, "サーバー時刻を確認できません。"); return now; }

/** 取得と時計判定は行ロック後。実行中の処理はSKIP LOCKEDで待たない。 */
export async function claimMockJob(db: PrismaClient, id: string, clock: MockClock = dbNow): Promise<MockExamJobRun | null> {
  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.mock_exam_job_runs WHERE id=${id}::uuid FOR UPDATE SKIP LOCKED`;
    if (!locked.length) return null;
    const row = await tx.mockExamJobRun.findUniqueOrThrow({ where: { id } }), now = validNow(await clock(tx));
    if (row.status === "completed" || (row.status === "running" ? +row.leaseUntil! > +now : +row.nextRunAt > +now)) return null;
    return tx.mockExamJobRun.update({ where: { id }, data: { status: "running", leaseToken: randomUUID(), leaseUntil: new Date(+now + 120000), attempts: { increment: 1 } } });
  }, options);
}

/** 期限切れ/交代済みworkerは進捗も完了印も上書きできない。 */
export async function finishMockJob(db: PrismaClient, lease: MockExamJobRun, outcome: Outcome, clock: MockClock = dbNow): Promise<boolean> {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.mock_exam_job_runs WHERE id=${lease.id}::uuid FOR UPDATE`;
    const now = validNow(await clock(tx));
    const failed = Boolean(outcome.errorCode), delay = retryMinutes[Math.min(lease.attempts - 1, retryMinutes.length - 1)] * 60000;
    const updated = await tx.mockExamJobRun.updateMany({ where: { id: lease.id, status: "running", leaseToken: lease.leaseToken, leaseUntil: { gt: now } }, data: {
      status: failed ? "failed" : outcome.done ? "completed" : "pending", leaseToken: null, leaseUntil: null,
      nextRunAt: new Date(+now + (failed ? delay : 0)), ...(outcome.cursor !== undefined ? { cursor: outcome.cursor } : {}),
      ...(failed ? { lastErrorCode: outcome.errorCode, lastErrorAt: now } : {}), ...(outcome.done && !failed ? { completedAt: now } : {}),
    } });
    return updated.count === 1;
  }, options);
}

export async function cleanMockJobMetadata(db: PrismaClient, now: Date): Promise<void> {
  validNow(now);
  // 最大±60秒を考慮し、nonceは消費後3分より古いものだけ整理する。
  await db.mockExamJobRun.deleteMany({ where: { kind: "dispatch", jobKey: { startsWith: "mock-dispatch:" }, createdAt: { lt: new Date(+now - 180000) } } });
  await db.mockExamJobRun.updateMany({ where: { kind: { not: "dispatch" }, lastErrorAt: { lt: new Date(+now - 30 * 86400000) } }, data: { lastErrorCode: null, lastErrorAt: null } });
}

async function enqueue(db: PrismaClient, now: Date) {
  const month = getTokyoDate(now).slice(0, 7), schedule = getMockSchedule(month);
  const date = new Date(`${month}-01T00:00:00Z`);
  if (+now >= +schedule.closesAt) date.setUTCMonth(date.getUTCMonth() + 1);
  const prepareMonth = date.toISOString().slice(0, 7);
  const ensure = async (jobKey: string, kind: string, targetMonth: Date, examCode: string | null) => db.mockExamJobRun.upsert({ where: { jobKey }, create: { jobKey, kind, targetMonth, examCode, nextRunAt: now }, update: {} });
  const due = await db.mockAttempt.findMany({ where: { status: "in_progress", expiresAt: { lte: now } }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: 25, select: { mockExamId: true, mockExam: { select: { targetMonth: true, exam: { select: { code: true } } } } } });
  for (const row of new Map(due.map(row => [row.mockExamId, row])).values()) {
    const job = await ensure(`mock:grade:${row.mockExamId}`, "grade", row.mockExam.targetMonth, row.mockExam.exam.code);
    // 新たな期限切れが発生した同じ試験の採点だけ再度pendingへ。失敗のbackoffは崩さない。
    await db.mockExamJobRun.updateMany({ where: { id: job.id, status: "completed" }, data: { status: "pending", nextRunAt: now, cursor: null } });
  }
  for (const code of ["it_passport", "fe"]) await ensure(`mock:prepare:${prepareMonth}:${code}`, "prepare", date, code);
  if (+now >= +schedule.reminderAt && +now < +schedule.closesAt) await ensure(`mock:remind:${month}`, "remind", new Date(`${month}-01`), null);
  const closed = await db.mockExam.findMany({ where: { status: "ready", availableUntil: { lte: now }, rewardsCompletedAt: null }, orderBy: [{ availableUntil: "asc" }, { id: "asc" }], take: 25, select: { id: true, targetMonth: true, exam: { select: { code: true } } } });
  for (const exam of closed) await ensure(`mock:settle:${exam.id}`, "settle", exam.targetMonth, exam.exam.code);
}

/** 1tickにつき1業務バッチ。25秒で学生間を区切り、原子的な1人分は途中切断しない。 */
export async function runMockJobs(db: PrismaClient, clock: MockClock = dbNow): Promise<{ processed: number; failed: number; remaining: boolean }> {
  const flags = readMockEnvironment(process.env);
  if (!flags.enabled || !flags.jobsEnabled) throw new MockError("jobs_disabled", 503, "自動処理は停止中です。");
  const deadline = performance.now() + 25000, canContinue = () => performance.now() < deadline;
  const now = validNow(await db.$transaction(clock, options));
  await cleanMockJobMetadata(db, now); await enqueue(db, now);
  let processed = 0, failed = 0;
  for (const kind of ["grade", "prepare", "remind", "settle"]) {
    if (!canContinue()) break;
    const candidates = await db.mockExamJobRun.findMany({ where: { kind, OR: [{ status: { in: ["pending", "failed"] }, nextRunAt: { lte: now } }, { status: "running", leaseUntil: { lte: now } }] }, orderBy: [{ nextRunAt: "asc" }, { id: "asc" }], take: 4 });
    for (const candidate of candidates) {
      if (!canContinue()) break;
      const lease = await claimMockJob(db, candidate.id, clock); if (!lease) continue;
      try {
        const month = lease.targetMonth.toISOString().slice(0, 7); let outcome: Outcome;
        if (kind === "grade") {
          const examId = lease.jobKey.split(":").at(-1)!;
          await settleExpiredMockAttempts(db, examId, 25, clock, canContinue);
          const current = validNow(await db.$transaction(clock, options));
          outcome = { done: await db.mockAttempt.count({ where: { mockExamId: examId, status: "in_progress", expiresAt: { lte: current } } }) === 0 };
        } else if (kind === "prepare") {
          await prepareMockExam(db, { examCode: lease.examCode as ExamCode, month }, clock); outcome = { done: true };
        } else if (kind === "remind") {
          const result = await sendMockRemindersBatch(db, month, lease.cursor, clock, canContinue); outcome = { done: result.nextCursor === null, cursor: result.nextCursor };
        } else {
          const result = await settleMockExamBatch(db, lease.jobKey.split(":").at(-1)!, clock, canContinue); outcome = { done: result.phase === "complete" };
        }
        await finishMockJob(db, lease, outcome, clock); processed++;
      } catch (cause) {
        const code = cause instanceof MockError && /^[a-z0-9_]{1,80}$/.test(cause.code) ? cause.code : "job_failed";
        await finishMockJob(db, lease, { done: false, errorCode: code }, clock); failed++;
      }
      // 一度のHTTP成功は業務完了を意味しない。残件を明示して次のtickへ渡す。
      const remaining = await db.mockExamJobRun.findMany({ where: { kind: { in: ["grade", "prepare", "remind", "settle"] }, status: { not: "completed" } }, take: 1, select: { id: true } });
      return { processed, failed, remaining: remaining.length > 0 };
    }
  }
  const remaining = await db.mockExamJobRun.findMany({ where: { kind: { in: ["grade", "prepare", "remind", "settle"] }, status: { not: "completed" } }, take: 1, select: { id: true } });
  return { processed, failed, remaining: remaining.length > 0 };
}
