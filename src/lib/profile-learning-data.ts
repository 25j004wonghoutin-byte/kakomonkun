import "server-only";

import { Prisma } from "../../prisma/generated/client";
import { PRACTICE_CATEGORIES } from "@/lib/practice-config";
import { prisma } from "@/lib/prisma";
import { getTokyoDate, getTokyoMonthRange } from "@/lib/tokyo-date";

export type LearningPeriod = "month" | "three-months" | "all";

export type LearningFilters = {
  period: LearningPeriod;
  examId: string | null;
  page: number;
};

type AggregateRow = {
  code: string;
  name: string;
  total: bigint | number;
  correct: bigint | number;
};

type ExamAggregateRow = {
  id: string;
  code: string;
  name: string;
  session_count: bigint | number;
  answer_count: bigint | number;
  correct_count: bigint | number;
};

export type ProfileLearningData = {
  filters: LearningFilters;
  exams: Array<{ id: string; code: string; name: string }>;
  stats: {
    practiceCount: number;
    answerCount: number;
    correctCount: number;
    accuracy: number;
    previousMonthAccuracy: number | null;
  };
  trend: Array<{
    key: string;
    label: string;
    accuracy: number;
    answerCount: number;
  }>;
  examStats: Array<{
    id: string;
    code: string;
    name: string;
    practiceCount: number;
    answerCount: number;
    correctCount: number;
    accuracy: number;
  }>;
  categoryStats: Array<{
    code: string;
    name: string;
    answerCount: number;
    correctCount: number;
    accuracy: number;
  }>;
  history: Array<{
    id: string;
    completedAt: string;
    examName: string;
    categoryName: string;
    correctCount: number;
    answeredCount: number;
    earnedPoints: number;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

const HISTORY_PAGE_SIZE = 5;

export async function getStudentLearningData(
  userId: string,
  filters: LearningFilters,
): Promise<ProfileLearningData> {
  const periodRange = getPeriodRange(filters.period);
  const completedAt = periodRange.start
    ? { gte: periodRange.start, lt: periodRange.end }
    : { not: null };
  const sessionWhere: Prisma.PracticeSessionWhereInput = {
    userId,
    status: "completed",
    completedAt,
    ...(filters.examId ? { examId: filters.examId } : {}),
  };
  const { start, previousStart } = getTokyoMonthRange();
  const previousMonthWhere: Prisma.PracticeSessionWhereInput = {
    userId,
    status: "completed",
    completedAt: { gte: previousStart, lt: start },
    ...(filters.examId ? { examId: filters.examId } : {}),
  };
  const dateConditions = periodRange.start
    ? Prisma.sql`
        AND practice_session.completed_at >= ${periodRange.start}
        AND practice_session.completed_at < ${periodRange.end}
      `
    : Prisma.empty;
  const examCondition = filters.examId
    ? Prisma.sql`AND practice_session.exam_id = ${filters.examId}::uuid`
    : Prisma.empty;

  const [
    exams,
    aggregate,
    previousMonthAggregate,
    trendSessions,
    categoryRows,
    examRows,
    historyCount,
    historyRows,
  ] = await Promise.all([
    prisma.exam.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.practiceSession.aggregate({
      where: sessionWhere,
      _count: { _all: true },
      _sum: { answeredCount: true, correctCount: true },
    }),
    prisma.practiceSession.aggregate({
      where: previousMonthWhere,
      _sum: { answeredCount: true, correctCount: true },
    }),
    prisma.practiceSession.findMany({
      where: sessionWhere,
      orderBy: { completedAt: "asc" },
      select: { completedAt: true, answeredCount: true, correctCount: true },
    }),
    prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      SELECT
        category.code,
        category.name,
        COUNT(answer.id) AS total,
        COUNT(answer.id) FILTER (WHERE answer.is_correct) AS correct
      FROM practice_answers AS answer
      INNER JOIN practice_sessions AS practice_session
        ON practice_session.id = answer.session_id
      INNER JOIN questions AS question ON question.id = answer.question_id
      INNER JOIN question_categories AS category ON category.id = question.category_id
      WHERE practice_session.user_id = ${userId}::uuid
        AND practice_session.status = 'completed'
        ${dateConditions}
        ${examCondition}
      GROUP BY category.code, category.name, category.sort_order
      ORDER BY category.sort_order
    `),
    prisma.$queryRaw<ExamAggregateRow[]>(Prisma.sql`
      SELECT
        exam.id,
        exam.code,
        exam.name,
        COUNT(practice_session.id) AS session_count,
        COALESCE(SUM(practice_session.answered_count), 0) AS answer_count,
        COALESCE(SUM(practice_session.correct_count), 0) AS correct_count
      FROM practice_sessions AS practice_session
      INNER JOIN exams AS exam ON exam.id = practice_session.exam_id
      WHERE practice_session.user_id = ${userId}::uuid
        AND practice_session.status = 'completed'
        ${dateConditions}
        ${examCondition}
      GROUP BY exam.id, exam.code, exam.name
      ORDER BY exam.code
    `),
    prisma.practiceSession.count({ where: sessionWhere }),
    prisma.practiceSession.findMany({
      where: sessionWhere,
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * HISTORY_PAGE_SIZE,
      take: HISTORY_PAGE_SIZE,
      select: {
        id: true,
        completedAt: true,
        answeredCount: true,
        correctCount: true,
        earnedPoints: true,
        exam: { select: { name: true } },
        answers: {
          select: {
            question: { select: { category: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const answerCount = aggregate._sum.answeredCount ?? 0;
  const correctCount = aggregate._sum.correctCount ?? 0;
  const previousAnswerCount = previousMonthAggregate._sum.answeredCount ?? 0;
  const previousCorrectCount = previousMonthAggregate._sum.correctCount ?? 0;
  const categoryByCode = new Map(categoryRows.map((row) => [row.code, row]));
  const examById = new Map(examRows.map((row) => [row.id, row]));
  const visibleExams = filters.examId
    ? exams.filter((exam) => exam.id === filters.examId)
    : exams;

  return {
    filters,
    exams,
    stats: {
      practiceCount: aggregate._count._all,
      answerCount,
      correctCount,
      accuracy: calculateAccuracy(correctCount, answerCount),
      previousMonthAccuracy:
        previousAnswerCount > 0
          ? calculateAccuracy(previousCorrectCount, previousAnswerCount)
          : null,
    },
    trend: buildTrend(trendSessions, filters.period),
    examStats: visibleExams.map((exam) => {
      const row = examById.get(exam.id);
      const examAnswerCount = Number(row?.answer_count ?? 0);
      const examCorrectCount = Number(row?.correct_count ?? 0);
      return {
        ...exam,
        practiceCount: Number(row?.session_count ?? 0),
        answerCount: examAnswerCount,
        correctCount: examCorrectCount,
        accuracy: calculateAccuracy(examCorrectCount, examAnswerCount),
      };
    }),
    categoryStats: PRACTICE_CATEGORIES.map((category) => {
      const row = categoryByCode.get(category.code);
      const categoryAnswerCount = Number(row?.total ?? 0);
      const categoryCorrectCount = Number(row?.correct ?? 0);
      return {
        code: category.code,
        name: row?.name ?? `${category.label}系`,
        answerCount: categoryAnswerCount,
        correctCount: categoryCorrectCount,
        accuracy: calculateAccuracy(categoryCorrectCount, categoryAnswerCount),
      };
    }),
    history: historyRows.flatMap((session) => {
      if (!session.completedAt) return [];
      const categoryNames = new Set(
        session.answers.map((answer) => answer.question.category.name.replace(/系$/, "")),
      );
      return [
        {
          id: session.id,
          completedAt: session.completedAt.toISOString(),
          examName: session.exam.name,
          categoryName:
            categoryNames.size === 1 ? Array.from(categoryNames)[0] : "すべて",
          correctCount: session.correctCount,
          answeredCount: session.answeredCount,
          earnedPoints: session.earnedPoints,
        },
      ];
    }),
    pagination: {
      page: filters.page,
      pageSize: HISTORY_PAGE_SIZE,
      totalCount: historyCount,
      totalPages: Math.max(1, Math.ceil(historyCount / HISTORY_PAGE_SIZE)),
    },
  };
}

function getPeriodRange(period: LearningPeriod) {
  const { start, end } = getTokyoMonthRange();
  if (period === "all") return { start: null, end: null };
  if (period === "month") return { start, end };

  const [year, month] = getTokyoDate().split("-").map(Number);
  return { start: getTokyoMonthBoundary(year, month - 3), end };
}

function getTokyoMonthBoundary(year: number, zeroBasedMonth: number) {
  const normalized = new Date(Date.UTC(year, zeroBasedMonth, 1));
  const normalizedYear = normalized.getUTCFullYear();
  const normalizedMonth = String(normalized.getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${normalizedYear}-${normalizedMonth}-01T00:00:00+09:00`);
}

function buildTrend(
  sessions: Array<{
    completedAt: Date | null;
    answeredCount: number;
    correctCount: number;
  }>,
  period: LearningPeriod,
) {
  const buckets = new Map<
    string,
    { key: string; label: string; answerCount: number; correctCount: number }
  >();

  if (period === "month") {
    for (let week = 1; week <= 5; week += 1) {
      buckets.set(String(week), {
        key: String(week),
        label: `第${week}週`,
        answerCount: 0,
        correctCount: 0,
      });
    }
  } else if (period === "three-months") {
    const [year, month] = getTokyoDate().split("-").map(Number);
    for (let offset = -2; offset <= 0; offset += 1) {
      const date = new Date(Date.UTC(year, month - 1 + offset, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, {
        key,
        label: `${date.getUTCMonth() + 1}月`,
        answerCount: 0,
        correctCount: 0,
      });
    }
  }

  for (const session of sessions) {
    if (!session.completedAt) continue;
    const parts = getTokyoDateParts(session.completedAt);
    const key =
      period === "month"
        ? String(Math.min(5, Math.floor((parts.day - 1) / 7) + 1))
        : `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    const existing = buckets.get(key) ?? {
      key,
      label: `${parts.year}/${String(parts.month).padStart(2, "0")}`,
      answerCount: 0,
      correctCount: 0,
    };
    existing.answerCount += session.answeredCount;
    existing.correctCount += session.correctCount;
    buckets.set(key, existing);
  }

  const values = Array.from(buckets.values())
    .sort((left, right) => left.key.localeCompare(right.key))
    .slice(period === "all" ? -6 : 0);

  return values.map(({ correctCount, ...bucket }) => ({
    ...bucket,
    accuracy: calculateAccuracy(correctCount, bucket.answerCount),
  }));
}

function getTokyoDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function calculateAccuracy(correctCount: number, answerCount: number) {
  return answerCount > 0 ? Math.round((correctCount / answerCount) * 100) : 0;
}
