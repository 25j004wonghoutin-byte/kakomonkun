export type StudentLearningSummary = {
  id: string;
  displayName: string;
  latestLearningAt: string | null;
  answerCount: number;
  correctCount: number;
  accuracy: number;
};

export type StudentLearningPage = {
  items: StudentLearningSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type StudentSummaryRow = {
  id: string;
  display_name: string;
  daily_answer_count: bigint | number;
  daily_correct_count: bigint | number;
  practice_answer_count: bigint | number;
  practice_correct_count: bigint | number;
  daily_latest_at: Date | null;
  practice_latest_at: Date | null;
};

const STUDENT_PAGE_SIZE = 20;

export function calculateAccuracy(correctCount: number, answerCount: number) {
  return answerCount > 0 ? Math.round((correctCount / answerCount) * 100) : 0;
}

export function latestLearningAt(
  dailyLatestAt: Date | string | null,
  practiceLatestAt: Date | string | null,
) {
  if (!dailyLatestAt && !practiceLatestAt) return null;
  if (!dailyLatestAt) return new Date(practiceLatestAt!).toISOString();
  if (!practiceLatestAt) return new Date(dailyLatestAt).toISOString();

  const dailyTime = new Date(dailyLatestAt).getTime();
  const practiceTime = new Date(practiceLatestAt).getTime();
  return new Date(Math.max(dailyTime, practiceTime)).toISOString();
}

export function normalizeStudentPage(value: string | number | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

export async function listStudentLearningSummaries(
  page: number,
): Promise<StudentLearningPage> {
  const normalizedPage = normalizeStudentPage(page);
  const offset = (normalizedPage - 1) * STUDENT_PAGE_SIZE;
  const [{ Prisma }, { prisma }] = await Promise.all([
    import("../../../prisma/generated/client"),
    import("../prisma"),
  ]);

  const [rows, total] = await Promise.all([
    prisma.$queryRaw<StudentSummaryRow[]>(Prisma.sql`
      WITH daily AS (
        SELECT
          answer.user_id,
          COUNT(answer.id) AS answer_count,
          COUNT(answer.id) FILTER (WHERE answer.is_correct) AS correct_count,
          MAX(answer.answered_at) AS latest_at
        FROM daily_qa_answers AS answer
        GROUP BY answer.user_id
      ),
      practice AS (
        SELECT
          practice_session.user_id,
          COALESCE(SUM(practice_session.answered_count), 0) AS answer_count,
          COALESCE(SUM(practice_session.correct_count), 0) AS correct_count,
          MAX(practice_session.completed_at) AS latest_at
        FROM practice_sessions AS practice_session
        WHERE practice_session.status = 'completed'
        GROUP BY practice_session.user_id
      )
      SELECT
        app_user.id,
        app_user.display_name,
        COALESCE(daily.answer_count, 0) AS daily_answer_count,
        COALESCE(daily.correct_count, 0) AS daily_correct_count,
        COALESCE(practice.answer_count, 0) AS practice_answer_count,
        COALESCE(practice.correct_count, 0) AS practice_correct_count,
        daily.latest_at AS daily_latest_at,
        practice.latest_at AS practice_latest_at
      FROM users AS app_user
      INNER JOIN roles AS role ON role.id = app_user.role_id
      LEFT JOIN daily ON daily.user_id = app_user.id
      LEFT JOIN practice ON practice.user_id = app_user.id
      WHERE role.name = 'student'
        AND app_user.status = 'active'
        AND app_user.deleted_at IS NULL
      ORDER BY
        GREATEST(daily.latest_at, practice.latest_at) DESC NULLS LAST,
        app_user.id ASC
      LIMIT ${STUDENT_PAGE_SIZE}
      OFFSET ${offset}
    `),
    prisma.user.count({
      where: {
        role: { name: "student" },
        status: "active",
        deletedAt: null,
      },
    }),
  ]);

  return {
    items: rows.map((row) => {
      const dailyAnswerCount = Number(row.daily_answer_count);
      const dailyCorrectCount = Number(row.daily_correct_count);
      const practiceAnswerCount = Number(row.practice_answer_count);
      const practiceCorrectCount = Number(row.practice_correct_count);
      const answerCount = dailyAnswerCount + practiceAnswerCount;
      const correctCount = dailyCorrectCount + practiceCorrectCount;

      return {
        id: row.id,
        displayName: row.display_name,
        latestLearningAt: latestLearningAt(
          row.daily_latest_at,
          row.practice_latest_at,
        ),
        answerCount,
        correctCount,
        accuracy: calculateAccuracy(correctCount, answerCount),
      };
    }),
    page: normalizedPage,
    pageSize: STUDENT_PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / STUDENT_PAGE_SIZE)),
  };
}
