export type TeacherStudentDetailTab = "practice" | "daily";

export type TeacherStudentDetailQuery = {
  tab: TeacherStudentDetailTab;
  page: number;
};

export type PracticeHistoryItem = {
  id: string;
  completedAt: string;
  examName: string;
  questionCount: number;
  correctCount: number;
  accuracy: number;
  earnedPoints: number;
};

export type DailyHistoryItem = {
  id: string;
  answerDate: string;
  answeredAt: string;
  examCode: string;
  examName: string;
  sourceYear: number | null;
  sourceSeason: string | null;
  questionNo: number | null;
  questionText: string;
  selectedChoiceLabel: string;
  selectedChoiceText: string;
  isCorrect: boolean;
};

export type TeacherStudentDetail = {
  student: {
    id: string;
    displayName: string;
    bio: string | null;
    totalPoints: number;
    latestLearningAt: string | null;
  };
  summary: {
    answerCount: number;
    correctCount: number;
    accuracy: number;
  };
  tab: TeacherStudentDetailTab;
  practiceHistory: PracticeHistoryItem[];
  dailyHistory: DailyHistoryItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type SummaryRow = {
  daily_answer_count: bigint | number;
  daily_correct_count: bigint | number;
  daily_latest_at: Date | null;
  practice_answer_count: bigint | number;
  practice_correct_count: bigint | number;
  practice_latest_at: Date | null;
};

const DETAIL_PAGE_SIZE = 20;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isStudentId(value: string) {
  return UUID_PATTERN.test(value);
}

export function parseTeacherStudentDetailQuery(
  params: Record<string, string | string[] | undefined>,
): TeacherStudentDetailQuery {
  const tabValue = firstValue(params.tab);
  const pageValue = Number(firstValue(params.page));

  return {
    tab: tabValue === "daily" ? "daily" : "practice",
    page:
      Number.isSafeInteger(pageValue) && pageValue > 0
        ? Math.min(pageValue, 10_000)
        : 1,
  };
}

export async function getTeacherStudentDetail(
  userId: string,
  query: TeacherStudentDetailQuery,
): Promise<TeacherStudentDetail | null> {
  if (!isStudentId(userId)) return null;

  const normalizedQuery: TeacherStudentDetailQuery = {
    tab: query.tab === "daily" ? "daily" : "practice",
    page:
      Number.isSafeInteger(query.page) && query.page > 0
        ? Math.min(query.page, 10_000)
        : 1,
  };
  const skip = (normalizedQuery.page - 1) * DETAIL_PAGE_SIZE;
  const [{ Prisma }, { prisma }, { calculateAccuracy, latestLearningAt }] =
    await Promise.all([
      import("../../../prisma/generated/client"),
      import("../prisma"),
      import("./students"),
    ]);

  const historyPromise =
    normalizedQuery.tab === "practice"
      ? Promise.all([
          prisma.practiceSession.count({
            where: {
              userId,
              status: "completed",
              completedAt: { not: null },
            },
          }),
          prisma.practiceSession.findMany({
            where: {
              userId,
              status: "completed",
              completedAt: { not: null },
            },
            orderBy: [{ completedAt: "desc" }, { id: "desc" }],
            skip,
            take: DETAIL_PAGE_SIZE,
            select: {
              id: true,
              completedAt: true,
              answeredCount: true,
              correctCount: true,
              earnedPoints: true,
              exam: { select: { name: true } },
            },
          }),
        ]).then(([total, rows]) => ({
          tab: "practice" as const,
          total,
          rows,
        }))
      : Promise.all([
          prisma.dailyQaAnswer.count({ where: { userId } }),
          prisma.dailyQaAnswer.findMany({
            where: { userId },
            orderBy: [{ answeredAt: "desc" }, { id: "desc" }],
            skip,
            take: DETAIL_PAGE_SIZE,
            select: {
              id: true,
              answerDate: true,
              answeredAt: true,
              isCorrect: true,
              selectedChoice: {
                select: { choiceLabel: true, choiceText: true },
              },
              question: {
                select: {
                  sourceYear: true,
                  sourceSeason: true,
                  questionNo: true,
                  questionText: true,
                  exam: { select: { code: true, name: true } },
                },
              },
            },
          }),
        ]).then(([total, rows]) => ({
          tab: "daily" as const,
          total,
          rows,
        }));

  const [student, summaryRows, history] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: userId,
        role: { name: "student" },
        status: "active",
        deletedAt: null,
      },
      select: {
        id: true,
        displayName: true,
        studentProfile: {
          select: { bio: true, totalPoints: true },
        },
      },
    }),
    prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM daily_qa_answers WHERE user_id = ${userId}::uuid)
          AS daily_answer_count,
        (SELECT COUNT(*) FROM daily_qa_answers WHERE user_id = ${userId}::uuid AND is_correct)
          AS daily_correct_count,
        (SELECT MAX(answered_at) FROM daily_qa_answers WHERE user_id = ${userId}::uuid)
          AS daily_latest_at,
        (SELECT COALESCE(SUM(answered_count), 0) FROM practice_sessions
          WHERE user_id = ${userId}::uuid AND status = 'completed')
          AS practice_answer_count,
        (SELECT COALESCE(SUM(correct_count), 0) FROM practice_sessions
          WHERE user_id = ${userId}::uuid AND status = 'completed')
          AS practice_correct_count,
        (SELECT MAX(completed_at) FROM practice_sessions
          WHERE user_id = ${userId}::uuid AND status = 'completed')
          AS practice_latest_at
    `),
    historyPromise,
  ]);

  if (!student) return null;

  const summary = summaryRows[0];
  const dailyAnswerCount = Number(summary?.daily_answer_count ?? 0);
  const dailyCorrectCount = Number(summary?.daily_correct_count ?? 0);
  const practiceAnswerCount = Number(summary?.practice_answer_count ?? 0);
  const practiceCorrectCount = Number(summary?.practice_correct_count ?? 0);
  const answerCount = dailyAnswerCount + practiceAnswerCount;
  const correctCount = dailyCorrectCount + practiceCorrectCount;
  const totalPages = Math.max(1, Math.ceil(history.total / DETAIL_PAGE_SIZE));

  const practiceHistory: PracticeHistoryItem[] =
    history.tab === "practice"
      ? history.rows.flatMap((session) => {
          if (!session.completedAt) return [];
          return [
            {
              id: session.id,
              completedAt: session.completedAt.toISOString(),
              examName: session.exam.name,
              questionCount: session.answeredCount,
              correctCount: session.correctCount,
              accuracy: calculateAccuracy(
                session.correctCount,
                session.answeredCount,
              ),
              earnedPoints: session.earnedPoints,
            },
          ];
        })
      : [];

  const dailyHistory: DailyHistoryItem[] =
    history.tab === "daily"
      ? history.rows.map((answer) => ({
          id: answer.id,
          answerDate: answer.answerDate.toISOString(),
          answeredAt: answer.answeredAt.toISOString(),
          examCode: answer.question.exam.code,
          examName: answer.question.exam.name,
          sourceYear: answer.question.sourceYear,
          sourceSeason: answer.question.sourceSeason,
          questionNo: answer.question.questionNo,
          questionText: answer.question.questionText,
          selectedChoiceLabel: answer.selectedChoice.choiceLabel,
          selectedChoiceText: answer.selectedChoice.choiceText,
          isCorrect: answer.isCorrect,
        }))
      : [];

  return {
    student: {
      id: student.id,
      displayName: student.displayName,
      bio: student.studentProfile?.bio ?? null,
      totalPoints: student.studentProfile?.totalPoints ?? 0,
      latestLearningAt: latestLearningAt(
        summary?.daily_latest_at ?? null,
        summary?.practice_latest_at ?? null,
      ),
    },
    summary: {
      answerCount,
      correctCount,
      accuracy: calculateAccuracy(correctCount, answerCount),
    },
    tab: normalizedQuery.tab,
    practiceHistory,
    dailyHistory,
    pagination: {
      page: normalizedQuery.page,
      pageSize: DETAIL_PAGE_SIZE,
      total: history.total,
      totalPages,
    },
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
