import type { PrismaClient } from "../../../prisma/generated/client";
import { createMockReminderNotification } from "../notifications/write";
import { MockError, type MockClock, type MonthKey } from "./contract";
import { readMockEnvironment } from "./environment";
import { dbNow } from "./locks";
import { getMockSchedule } from "./schedule";

/** 月に1通。候補選択後の提出・利用停止も、学生ロック後に再確認する。 */
export async function sendMockRemindersBatch(
  db: PrismaClient, month: MonthKey, cursor: string | null, clock: MockClock = dbNow,
): Promise<{ sent: number; nextCursor: string | null }> {
  if (!readMockEnvironment(process.env).enabled) throw new MockError("mock_disabled", 503, "模擬試験は現在準備中です。");
  const schedule = getMockSchedule(month);
  if (cursor !== null && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cursor)) {
    throw new MockError("invalid_cursor", 400, "通知の処理位置が正しくありません。");
  }
  const inWindow = (now: Date) => {
    if (!Number.isFinite(+now)) throw new MockError("invalid_clock", 503, "サーバー時刻を確認できません。");
    return +now >= +schedule.reminderAt && +now < +schedule.closesAt;
  };
  const now = await db.$transaction(clock, { maxWait: 10000, timeout: 30000 });
  if (!inWindow(now)) return { sent: 0, nextCursor: null };
  const students = await db.user.findMany({
    where: { ...(cursor ? { id: { gt: cursor } } : {}), role: { name: "student" }, status: "active", deletedAt: null, createdAt: { lte: schedule.reminderAt } },
    orderBy: { id: "asc" }, take: 101, select: { id: true },
  });
  const targetMonth = new Date(`${month}-01`);
  let sent = 0;
  for (const student of students.slice(0, 100)) {
    sent += await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM public.users WHERE id=${student.id}::uuid FOR NO KEY UPDATE`;
      const current = await tx.user.findUnique({ where: { id: student.id }, select: { role: { select: { name: true } }, status: true, deletedAt: true, createdAt: true } });
      if (!inWindow(await clock(tx)) || !current || current.role.name !== "student" || current.status !== "active"
        || current.deletedAt !== null || +current.createdAt > +schedule.reminderAt) return 0;
      const submitted = await tx.mockAttempt.count({ where: { userId: student.id, status: "submitted", mockExam: { targetMonth, exam: { code: { in: ["it_passport", "fe"] } } } } });
      if (submitted > 0) return 0;
      return createMockReminderNotification(tx, student.id, targetMonth);
    }, { maxWait: 10000, timeout: 30000 });
  }
  return { sent, nextCursor: students.length > 100 ? students[99].id : null };
}
