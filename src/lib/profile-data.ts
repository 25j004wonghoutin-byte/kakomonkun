import "server-only";

import { PRACTICE_CATEGORIES } from "@/lib/practice-config";
import { prisma } from "@/lib/prisma";
import { getTokyoMonthRange } from "@/lib/tokyo-date";

type CategoryAggregateRow = {
  code: string;
  name: string;
  overall_total: bigint | number;
  overall_correct: bigint | number;
  month_total: bigint | number;
  month_correct: bigint | number;
};

export type ProfileTitleData = {
  id: string;
  name: string;
  description: string | null;
  rarity: string;
};

export type ProfileCategoryStat = {
  code: string;
  name: string;
  overallAccuracy: number;
  overallAnswerCount: number;
  monthAccuracy: number;
  monthAnswerCount: number;
};

export type ProfileRecentActivity = {
  id: string;
  kind: "practice" | "daily";
  title: string;
  detail: string;
  occurredAt: string;
  result: string;
  earnedPoints: number;
};

export type ProfilePageData = {
  profile: {
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    totalPoints: number;
    currentTitle: ProfileTitleData | null;
  };
  stats: {
    totalPracticeCount: number;
    totalCorrectCount: number;
    totalAnswerCount: number;
    overallAccuracy: number;
    monthPracticeCount: number;
    monthCorrectCount: number;
    monthAnswerCount: number;
    monthAccuracy: number;
    previousMonthAccuracy: number | null;
    monthPoints: number;
  };
  categoryStats: ProfileCategoryStat[];
  ownedTitles: Array<
    ProfileTitleData & {
      purchasedAt: string;
      equippedAt: string | null;
    }
  >;
  recentActivities: ProfileRecentActivity[];
};

export async function getStudentProfileData(userId: string): Promise<ProfilePageData> {
  const { monthString, start, end, previousStart } = getTokyoMonthRange();
  const [year, month] = monthString.split("-").map(Number);
  const transactionStart = new Date(Date.UTC(year, month - 1, 1));
  const transactionEnd = new Date(Date.UTC(year, month, 1));

  const [
    profile,
    ownedTitles,
    monthSessions,
    previousMonthSessions,
    monthPointAggregate,
    categoryRows,
    practiceActivities,
    dailyActivities,
  ] = await Promise.all([
    prisma.studentProfile.findUniqueOrThrow({
      where: { userId },
      select: {
        avatarUrl: true,
        bio: true,
        totalPoints: true,
        totalPracticeCount: true,
        totalCorrectCount: true,
        totalAnswerCount: true,
        user: { select: { displayName: true } },
        currentTitle: {
          select: {
            id: true,
            name: true,
            description: true,
            rarity: true,
          },
        },
      },
    }),
    prisma.userTitle.findMany({
      where: {
        userId,
        title: { isActive: true },
      },
      orderBy: [{ title: { sortOrder: "asc" } }, { purchasedAt: "asc" }],
      select: {
        purchasedAt: true,
        equippedAt: true,
        title: {
          select: {
            id: true,
            name: true,
            description: true,
            rarity: true,
          },
        },
      },
    }),
    prisma.practiceSession.aggregate({
      where: {
        userId,
        status: "completed",
        completedAt: { gte: start, lt: end },
      },
      _count: { _all: true },
      _sum: { answeredCount: true, correctCount: true },
    }),
    prisma.practiceSession.aggregate({
      where: {
        userId,
        status: "completed",
        completedAt: { gte: previousStart, lt: start },
      },
      _sum: { answeredCount: true, correctCount: true },
    }),
    prisma.pointTransaction.aggregate({
      where: {
        userId,
        transactionDate: { gte: transactionStart, lt: transactionEnd },
      },
      _sum: { points: true },
    }),
    prisma.$queryRaw<CategoryAggregateRow[]>`
      SELECT
        category.code,
        category.name,
        COUNT(answer.id) AS overall_total,
        COUNT(answer.id) FILTER (WHERE answer.is_correct) AS overall_correct,
        COUNT(answer.id) FILTER (
          WHERE session.completed_at >= ${start}
            AND session.completed_at < ${end}
        ) AS month_total,
        COUNT(answer.id) FILTER (
          WHERE answer.is_correct
            AND session.completed_at >= ${start}
            AND session.completed_at < ${end}
        ) AS month_correct
      FROM practice_answers AS answer
      INNER JOIN practice_sessions AS session ON session.id = answer.session_id
      INNER JOIN questions AS question ON question.id = answer.question_id
      INNER JOIN question_categories AS category ON category.id = question.category_id
      WHERE session.user_id = ${userId}::uuid
        AND session.status = 'completed'
      GROUP BY category.code, category.name, category.sort_order
      ORDER BY category.sort_order
    `,
    prisma.practiceSession.findMany({
      where: {
        userId,
        status: "completed",
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: {
        id: true,
        questionCount: true,
        answeredCount: true,
        correctCount: true,
        earnedPoints: true,
        completedAt: true,
        exam: { select: { name: true } },
        answers: {
          select: {
            question: {
              select: {
                category: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.dailyQaAnswer.findMany({
      where: { userId },
      orderBy: { answeredAt: "desc" },
      take: 8,
      select: {
        id: true,
        isCorrect: true,
        answeredAt: true,
        answerPointAwarded: true,
        correctPointAwarded: true,
        question: {
          select: {
            exam: { select: { name: true } },
            category: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const categoryByCode = new Map(categoryRows.map((row) => [row.code, row]));
  const categoryStats = PRACTICE_CATEGORIES.map((category) => {
    const row = categoryByCode.get(category.code);
    const overallAnswerCount = Number(row?.overall_total ?? 0);
    const overallCorrectCount = Number(row?.overall_correct ?? 0);
    const monthAnswerCount = Number(row?.month_total ?? 0);
    const monthCorrectCount = Number(row?.month_correct ?? 0);

    return {
      code: category.code,
      name: row?.name ?? `${category.label}系`,
      overallAccuracy: calculateAccuracy(overallCorrectCount, overallAnswerCount),
      overallAnswerCount,
      monthAccuracy: calculateAccuracy(monthCorrectCount, monthAnswerCount),
      monthAnswerCount,
    };
  });

  const monthAnswerCount = monthSessions._sum.answeredCount ?? 0;
  const monthCorrectCount = monthSessions._sum.correctCount ?? 0;
  const previousMonthAnswerCount = previousMonthSessions._sum.answeredCount ?? 0;
  const previousMonthCorrectCount = previousMonthSessions._sum.correctCount ?? 0;

  const practiceRecent: ProfileRecentActivity[] = practiceActivities.flatMap((session) => {
    if (!session.completedAt) return [];

    const categoryNames = new Set(
      session.answers.map((answer) => answer.question.category.name.replace(/系$/, "")),
    );
    const categorySuffix =
      categoryNames.size === 1 ? `・${Array.from(categoryNames)[0]}` : "";

    return [
      {
        id: `practice-${session.id}`,
        kind: "practice" as const,
        title: `${session.exam.name}${categorySuffix} ${session.questionCount}問`,
        detail: "過去問練習",
        occurredAt: session.completedAt.toISOString(),
        result: `${session.correctCount} / ${session.answeredCount}`,
        earnedPoints: session.earnedPoints,
      },
    ];
  });

  const dailyRecent: ProfileRecentActivity[] = dailyActivities.map((answer) => ({
    id: `daily-${answer.id}`,
    kind: "daily",
    title: "今日の一問一答",
    detail: `${answer.question.exam.name}・${answer.question.category.name}`,
    occurredAt: answer.answeredAt.toISOString(),
    result: answer.isCorrect ? "正解" : "不正解",
    earnedPoints:
      Number(answer.answerPointAwarded) + Number(answer.correctPointAwarded),
  }));

  return {
    profile: {
      displayName: profile.user.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      totalPoints: profile.totalPoints,
      currentTitle: profile.currentTitle,
    },
    stats: {
      totalPracticeCount: profile.totalPracticeCount,
      totalCorrectCount: profile.totalCorrectCount,
      totalAnswerCount: profile.totalAnswerCount,
      overallAccuracy: calculateAccuracy(
        profile.totalCorrectCount,
        profile.totalAnswerCount,
      ),
      monthPracticeCount: monthSessions._count._all,
      monthCorrectCount,
      monthAnswerCount,
      monthAccuracy: calculateAccuracy(monthCorrectCount, monthAnswerCount),
      previousMonthAccuracy:
        previousMonthAnswerCount > 0
          ? calculateAccuracy(previousMonthCorrectCount, previousMonthAnswerCount)
          : null,
      monthPoints: monthPointAggregate._sum.points ?? 0,
    },
    categoryStats,
    ownedTitles: ownedTitles.map(({ title, purchasedAt, equippedAt }) => ({
      ...title,
      purchasedAt: purchasedAt.toISOString(),
      equippedAt: equippedAt?.toISOString() ?? null,
    })),
    recentActivities: [...practiceRecent, ...dailyRecent]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 8),
  };
}

function calculateAccuracy(correctCount: number, answerCount: number) {
  return answerCount > 0 ? Math.round((correctCount / answerCount) * 100) : 0;
}
