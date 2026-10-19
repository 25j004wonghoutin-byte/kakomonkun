import type { Prisma, PrismaClient } from "../../../prisma/generated/client";
import { MockError, type ExamCode, type MockActor, type MonthKey } from "../mock-exams/contract";
import { readMockEnvironment } from "../mock-exams/environment";
import { mockHeaders } from "../mock-exams/handlers";
import { dbNow } from "../mock-exams/locks";
import { rankBestAttempts } from "../mock-exams/ranking";
import { getMockPolicy, getMockSchedule } from "../mock-exams/schedule";
import { isTeacherRole } from "./identity";

type TeacherMockInput = { examCode: ExamCode; month: MonthKey; cursor: string | null };
type StudentState = "not_started" | "in_progress" | "submitted";
export type TeacherMockView = {
  examCode: ExamCode; month: MonthKey; availableMonths: string[];
  exam: null | { id: string; title: string; questionCount: number; timeLimitMinutes: number; opensAt: string; closesAt: string;
    state: "preparing" | "upcoming" | "open" | "closed"; rankingState: "provisional" | "settling" | "final"; rewardsComplete: boolean };
  targetStudentCount: number; counts: Record<StudentState, number>;
  students: { userId: string; name: string; status: StudentState; attempt1Score: number | null; attempt2Score: number | null; bestScore: number | null; rankNo: number | null }[];
  nextCursor: string | null;
};

function assertTeacher(actor: MockActor) {
  if (!isTeacherRole(actor.roleName) || actor.status !== "active" || actor.deletedAt !== null)
    throw new MockError("teacher_required", 403, "有効な教師アカウントで利用してください。");
}
function validate(input: TeacherMockInput) {
  getMockPolicy(input.examCode); getMockSchedule(input.month);
  if (input.cursor !== null && (typeof input.cursor !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.cursor)))
    throw new MockError("invalid_cursor", 400, "表示位置が正しくありません。");
}

/** 読み取り専用。期限切れを見つけても採点・報酬・受験の作成は行わない。 */
export async function getTeacherMockExams(db: PrismaClient, actor: MockActor, input: TeacherMockInput): Promise<TeacherMockView> {
  assertTeacher(actor); validate(input);
  if (!readMockEnvironment(process.env).enabled) throw new MockError("mock_disabled", 503, "模擬試験は現在準備中です。");
  const schedule = getMockSchedule(input.month), targetMonth = new Date(`${input.month}-01`);
  return db.$transaction(async tx => {
    const current = await tx.user.findUnique({ where: { id: actor.id }, select: { role: { select: { name: true } }, status: true, deletedAt: true } });
    if (!current) throw new MockError("teacher_required", 403, "有効な教師アカウントで利用してください。");
    assertTeacher({ id: actor.id, roleName: current.role.name, status: current.status, deletedAt: current.deletedAt });
    const now = await dbNow(tx);
    const exam = await tx.mockExam.findFirst({ where: { targetMonth, exam: { code: input.examCode } }, select: {
      id: true, title: true, status: true, questionCount: true, timeLimitMinutes: true, availableFrom: true, availableUntil: true, rankingFinalizedAt: true, rewardsCompletedAt: true,
    } });
    // 現在利用可能で、その月の締切より前に登録された学生を集計対象とする。
    const where: Prisma.UserWhereInput = { role: { name: "student" }, status: "active", deletedAt: null, createdAt: { lt: schedule.closesAt } };
    const submitted: Prisma.MockAttemptWhereInput = { mockExamId: exam?.id ?? "00000000-0000-0000-0000-000000000000", status: "submitted" };
    const active: Prisma.MockAttemptWhereInput = { ...submitted, status: "in_progress" };
    const total = await tx.user.count({ where });
    const submittedCount = await tx.user.count({ where: { ...where, mockAttempts: { some: submitted } } });
    const activeCount = await tx.user.count({ where: { ...where, AND: [{ mockAttempts: { none: submitted } }, { mockAttempts: { some: active } }] } });
    const users = await tx.user.findMany({ where: { ...where, ...(input.cursor ? { id: { gt: input.cursor } } : {}) }, orderBy: { id: "asc" }, take: 101,
      select: { id: true, displayName: true, mockAttempts: { where: { mockExamId: submitted.mockExamId }, orderBy: { attemptNo: "asc" }, select: { attemptNo: true, status: true, score: true } } } });
    const months = await tx.mockExam.findMany({ where: { exam: { code: input.examCode } }, select: { targetMonth: true } });
    let ranks = new Map<string, number>();
    if (exam?.rankingFinalizedAt) {
      const saved = await tx.monthlyRanking.findMany({ where: { mockExamId: exam.id, isFinal: true, userId: { in: users.slice(0, 100).map(user => user.id) } }, select: { userId: true, rankNo: true } });
      ranks = new Map(saved.map(row => [row.userId, row.rankNo]));
    } else if (exam) {
      const attempts = await tx.mockAttempt.findMany({ where: { mockExamId: exam.id, status: "submitted" }, select: { id: true, userId: true, attemptNo: true, correctCount: true, totalQuestions: true } });
      ranks = new Map(rankBestAttempts(attempts.map(row => ({ userId: row.userId, attemptId: row.id, attemptNo: row.attemptNo as 1 | 2, correctCount: row.correctCount, totalQuestions: row.totalQuestions }))).map(row => [row.userId, row.rankNo]));
    }
    return {
      examCode: input.examCode, month: input.month, availableMonths: [...new Set([input.month, ...months.map(row => row.targetMonth.toISOString().slice(0, 7))])].sort().reverse(),
      exam: exam ? { id: exam.id, title: exam.title, questionCount: exam.questionCount, timeLimitMinutes: exam.timeLimitMinutes,
        opensAt: exam.availableFrom.toISOString(), closesAt: exam.availableUntil.toISOString(),
        state: exam.status !== "ready" ? "preparing" : +now < +exam.availableFrom ? "upcoming" : +now >= +exam.availableUntil ? "closed" : "open",
        rankingState: exam.rankingFinalizedAt ? "final" : +now >= +exam.availableUntil ? "settling" : "provisional", rewardsComplete: exam.rewardsCompletedAt !== null } : null,
      targetStudentCount: total, counts: { not_started: total - submittedCount - activeCount, in_progress: activeCount, submitted: submittedCount },
      students: users.slice(0, 100).map(user => {
        const completed = user.mockAttempts.filter(row => row.status === "submitted");
        return { userId: user.id, name: user.displayName, status: completed.length ? "submitted" : user.mockAttempts.length ? "in_progress" : "not_started",
          attempt1Score: completed.some(row => row.attemptNo === 1) ? Number(completed.find(row => row.attemptNo === 1)!.score) : null,
          attempt2Score: completed.some(row => row.attemptNo === 2) ? Number(completed.find(row => row.attemptNo === 2)!.score) : null,
          bestScore: completed.length ? Math.max(...completed.map(row => Number(row.score))) : null, rankNo: ranks.get(user.id) ?? null };
      }), nextCursor: users.length > 100 ? users[99].id : null,
    };
  }, { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 30000 });
}

export function createTeacherMockHandler({ getUser, read }: { getUser: () => Promise<MockActor | null>; read: (actor: MockActor, input: TeacherMockInput) => Promise<unknown> }) {
  return async (request: Request): Promise<Response> => {
    try {
      const actor = await getUser(); if (!actor) throw new MockError("unauthorized", 401, "ログインしてください。");
      assertTeacher(actor);
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some(key => !["examCode", "month", "cursor"].includes(key)) || query.getAll("examCode").length !== 1 || query.getAll("month").length !== 1 || query.getAll("cursor").length > 1)
        throw new MockError("invalid_input", 400, "表示条件が正しくありません。");
      const input = { examCode: query.get("examCode") as ExamCode, month: query.get("month")!, cursor: query.get("cursor") };
      validate(input); return Response.json(await read(actor, input), { headers: mockHeaders });
    } catch (cause) {
      return Response.json({ error: cause instanceof MockError ? cause.message : "模擬試験の状況を取得できませんでした。", code: cause instanceof MockError ? cause.code : "internal_error" },
        { status: cause instanceof MockError ? cause.status : 500, headers: mockHeaders });
    }
  };
}
