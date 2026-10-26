import type { QuizAnswerResult, QuizQuestion } from "@/components/quiz-question-card";

export type ReviewStatus = "unreviewed" | "reviewing" | "reviewed";
export const REVIEW_PAGE_SIZE = 10 as const;
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { unreviewed: "未復習", reviewing: "復習中", reviewed: "復習済み" };
export type ReviewActor = { id: string; roleName: string; status: string; deletedAt: Date | null };
export type ReviewQuery = { status: "unfinished" | "reviewed" | "all"; examCode: string | null; categoryCode: string | null; page: number; sessionId: string | null };
export type ReviewListItem = {
  id: string; status: ReviewStatus; firstWrongAt: string; lastWrongAt: string; lastReviewedAt: string | null;
  exam: { code: string; name: string }; category: { code: string; name: string }; sourceLabel: string | null; questionPreview: string;
};
export type ReviewList = { query: ReviewQuery; items: ReviewListItem[]; total: number; pageCount: number; pageSize: 10 };
export type ReviewDetail = { id: string; status: ReviewStatus; revision: number; questionVersion: string; lastWrongAt: string; lastReviewedAt: string | null; question: QuizQuestion };
export type ReviewAnswerInput = { requestId: string; expectedRevision: number; questionVersion: string; selectedChoiceId: string };
export type ReviewAnswerResult = {
  item: { id: string; status: ReviewStatus; revision: number; lastReviewedAt: string };
  answer: QuizAnswerResult & { selectedChoiceId: string; answeredAt: string }; replayed: boolean;
};
export class ReviewNotebookError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 401 | 403 | 404 | 409 | 500, message: string) { super(message); }
}
