import { Prisma } from "../../../prisma/generated/client";
import { rankingTitleFactsFromRows } from "../mock-exams/ranking-title-facts";
import type { TitleCategory } from "./contract";

type AnswerRow = { isCorrect: boolean | null; answeredAt: string; categoryCode: string };
type DatedAnswerRow = AnswerRow & { answerDate: string | null };
type HistoryRow = {
  profile: { titleTrackingStartedAt: string | null } | null;
  daily: Array<DatedAnswerRow & { isCorrect: boolean; answerDate: string }>;
  random: DatedAnswerRow[];
  practiceAnswers: Array<AnswerRow & { isCorrect: boolean }>;
  sessions: Array<{ questionCount: number; answeredCount: number; correctCount: number }>;
  owned: Array<{ titleId: string; catalogKey: string | null }>;
  boardPostCount: number;
  boardCommentCount: number;
  mock: { answerCount: number; categoryCorrect: Record<TitleCategory, number> };
  rankings: Array<{ rankNo: number; targetMonth: string; examCode: string }>;
};

const questionCategory = (categoryCode: string) => ({ category: { code: categoryCode } });

/** One snapshot on the caller's transaction; independent aggregates prevent cross-history multiplication. */
export async function readTitleHistory(tx: Prisma.TransactionClient, userId: string, mockEnabled: boolean) {
  const mockQuery = mockEnabled ? Prisma.sql`
      SELECT a.is_correct, q.category_code
      FROM public.mock_answers a
      JOIN public.mock_attempts t ON t.id = a.attempt_id
      JOIN public.mock_exam_questions q ON q.id = a.mock_question_id
      WHERE t.user_id = (SELECT user_id FROM params) AND t.status = 'submitted'
        AND a.selected_choice_id IS NOT NULL AND (SELECT mock_enabled FROM params)
  ` : Prisma.sql`SELECT NULL::boolean AS is_correct, NULL::text AS category_code WHERE FALSE`;
  const rankingQuery = mockEnabled ? Prisma.sql`
    COALESCE((SELECT jsonb_agg(jsonb_build_object('rankNo', r.rank_no, 'targetMonth', r.target_month, 'examCode', e.code))
        FROM public.monthly_rankings r JOIN public.mock_exams m ON m.id = r.mock_exam_id
        JOIN public.exams e ON e.id = m.exam_id
        WHERE r.user_id = (SELECT user_id FROM params) AND r.is_final AND m.ranking_finalized_at IS NOT NULL
          AND e.code IN ('it_passport', 'fe') AND (SELECT mock_enabled FROM params)), '[]'::jsonb)
  ` : Prisma.sql`'[]'::jsonb`;
  const [row] = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`
    /* title-history */
    WITH params AS (SELECT ${userId}::uuid AS user_id, ${mockEnabled}::boolean AS mock_enabled),
    mock_history AS (${mockQuery})
    SELECT
      (SELECT jsonb_build_object('titleTrackingStartedAt', p.title_tracking_started_at)
        FROM public.student_profiles p WHERE p.user_id = (SELECT user_id FROM params)) AS profile,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('isCorrect', a.is_correct, 'answeredAt', a.answered_at,
        'answerDate', a.answer_date, 'categoryCode', c.code))
        FROM public.daily_qa_answers a JOIN public.questions q ON q.id = a.question_id
        JOIN public.question_categories c ON c.id = q.category_id
        WHERE a.user_id = (SELECT user_id FROM params)), '[]'::jsonb) AS daily,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('isCorrect', a.is_correct, 'answeredAt', a.answered_at,
        'answerDate', a.answer_date, 'categoryCode', c.code) ORDER BY a.answer_sequence ASC)
        FROM public.random_quiz_attempts a JOIN public.questions q ON q.id = a.question_id
        JOIN public.question_categories c ON c.id = q.category_id
        WHERE a.user_id = (SELECT user_id FROM params) AND a.answered_at IS NOT NULL), '[]'::jsonb) AS random,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('isCorrect', a.is_correct, 'answeredAt', a.answered_at, 'categoryCode', c.code))
        FROM public.practice_answers a JOIN public.practice_sessions s ON s.id = a.session_id
        JOIN public.questions q ON q.id = a.question_id JOIN public.question_categories c ON c.id = q.category_id
        WHERE s.user_id = (SELECT user_id FROM params)), '[]'::jsonb) AS "practiceAnswers",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('questionCount', s.question_count, 'answeredCount', s.answered_count,
        'correctCount', s.correct_count) ORDER BY s.completed_at ASC, s.id ASC)
        FROM public.practice_sessions s WHERE s.user_id = (SELECT user_id FROM params) AND s.status = 'completed'), '[]'::jsonb) AS sessions,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('titleId', o.title_id, 'catalogKey', t.catalog_key))
        FROM public.user_titles o JOIN public.titles t ON t.id = o.title_id
        WHERE o.user_id = (SELECT user_id FROM params)), '[]'::jsonb) AS owned,
      (SELECT count(*)::integer FROM public.board_posts p WHERE p.author_id = (SELECT user_id FROM params)) AS "boardPostCount",
      (SELECT count(*)::integer FROM public.board_comments c WHERE c.author_id = (SELECT user_id FROM params)) AS "boardCommentCount",
      (SELECT jsonb_build_object('answerCount', count(*)::integer, 'categoryCorrect', jsonb_build_object(
        'technology', count(*) FILTER (WHERE is_correct AND category_code = 'technology')::integer,
        'management', count(*) FILTER (WHERE is_correct AND category_code = 'management')::integer,
        'strategy', count(*) FILTER (WHERE is_correct AND category_code = 'strategy')::integer)) FROM mock_history) AS mock,
      ${rankingQuery} AS rankings
  `);
  if (!row) throw new Error("Title history query returned no row");
  return {
    profile: row.profile && { titleTrackingStartedAt: row.profile.titleTrackingStartedAt ? new Date(row.profile.titleTrackingStartedAt) : null },
    daily: row.daily.map(a => ({ isCorrect: a.isCorrect, answeredAt: new Date(a.answeredAt), answerDate: new Date(a.answerDate), question: questionCategory(a.categoryCode) })),
    random: row.random.map(a => ({ isCorrect: a.isCorrect, answeredAt: new Date(a.answeredAt), answerDate: a.answerDate ? new Date(a.answerDate) : null, question: questionCategory(a.categoryCode) })),
    practiceAnswers: row.practiceAnswers.map(a => ({ isCorrect: a.isCorrect, answeredAt: new Date(a.answeredAt), question: questionCategory(a.categoryCode) })),
    sessions: row.sessions,
    owned: row.owned.map(o => ({ titleId: o.titleId, title: { catalogKey: o.catalogKey } })),
    boardPostCount: row.boardPostCount,
    boardCommentCount: row.boardCommentCount,
    mock: row.mock,
    ranking: rankingTitleFactsFromRows(row.rankings.map(r => ({ rankNo: r.rankNo, targetMonth: new Date(r.targetMonth), mockExam: { exam: { code: r.examCode } } }))),
  };
}
