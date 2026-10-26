import type { Prisma, PrismaClient } from "../../../prisma/generated/client";
import { getQuestionPresentation } from "@/lib/official-question";
import { REVIEW_PAGE_SIZE, ReviewNotebookError, type ReviewQuery, type ReviewList, type ReviewDetail, type ReviewStatus } from "./contract";
import { questionVersionOf } from "./version";

const missing = () => new ReviewNotebookError("not_found", 404, "問題または練習が見つかりません。");
async function ownedSession(tx: Prisma.TransactionClient, userId: string, sessionId: string | null) {
  if (sessionId && !await tx.practiceSession.findUnique({ where: { id: sessionId, userId }, select: { id: true } })) throw missing();
}
function itemWhere(userId: string, query: ReviewQuery): Prisma.ReviewNotebookItemWhereInput {
  return {
    userId,
    ...(query.status === "unfinished" ? { status: { in: ["unreviewed", "reviewing"] } } : query.status === "reviewed" ? { status: "reviewed" } : {}),
    question: {
      status: "published", deletedAt: null,
      ...(query.examCode ? { exam: { code: query.examCode } } : {}),
      ...(query.categoryCode ? { category: { code: query.categoryCode } } : {}),
      ...(query.sessionId ? { practiceAnswers: { some: { sessionId: query.sessionId, isCorrect: false, session: { userId } } } } : {}),
    },
  };
}
const questionInclude = {
  exam: { select: { code: true, name: true } },
  category: { select: { code: true, name: true } },
  choices: { orderBy: { sortOrder: "asc" }, select: { id: true, choiceLabel: true, choiceText: true, updatedAt: true } },
} as const;

export async function readReviewList(db: PrismaClient, userId: string, query: ReviewQuery): Promise<ReviewList> {
  return db.$transaction(async tx => {
    await ownedSession(tx, userId, query.sessionId);
    const where = itemWhere(userId, query);
    const total = await tx.reviewNotebookItem.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
    const page = Math.min(query.page, pageCount);
    const items = await tx.reviewNotebookItem.findMany({ where, orderBy: [{ lastWrongAt: "desc" }, { id: "asc" }], skip: (page - 1) * REVIEW_PAGE_SIZE, take: REVIEW_PAGE_SIZE, include: { question: { include: { exam: true, category: true } } } });
    return { query: { ...query, page }, total, pageCount, pageSize: REVIEW_PAGE_SIZE, items: items.map(item => ({
      id: item.id, status: item.status as ReviewStatus, firstWrongAt: item.firstWrongAt.toISOString(), lastWrongAt: item.lastWrongAt.toISOString(), lastReviewedAt: item.lastReviewedAt?.toISOString() ?? null,
      exam: { code: item.question.exam.code, name: item.question.exam.name }, category: { code: item.question.category.code, name: item.question.category.name },
      sourceLabel: getQuestionPresentation(item.question).source?.label ?? ([item.question.sourceYear, item.question.sourceSeason, item.question.questionNo ? `問${item.question.questionNo}` : null].filter(value => value !== null).join(" ") || null),
      questionPreview: Array.from(item.question.questionText.trim() || "画像問題").slice(0, 120).join(""),
    })) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function readReviewItem(db: PrismaClient, userId: string, itemId: string): Promise<ReviewDetail> {
  const item = await db.reviewNotebookItem.findUnique({ where: { id: itemId, userId, question: { status: "published", deletedAt: null } }, include: { question: { include: questionInclude } } });
  if (!item) throw missing();
  const question = item.question;
  return {
    id: item.id, status: item.status as ReviewStatus, revision: item.revision, questionVersion: questionVersionOf(question), lastWrongAt: item.lastWrongAt.toISOString(), lastReviewedAt: item.lastReviewedAt?.toISOString() ?? null,
    question: { id: question.id, text: question.questionText, imagePath: question.imagePath, exam: question.exam, category: question.category, ...getQuestionPresentation(question), choices: question.choices.map(choice => ({ id: choice.id, label: choice.choiceLabel, text: choice.choiceText })) },
  };
}

export async function countPracticeReviewItems(db: PrismaClient, userId: string, sessionId: string): Promise<number> {
  return db.$transaction(async tx => {
    await ownedSession(tx, userId, sessionId);
    return tx.reviewNotebookItem.count({ where: itemWhere(userId, { status: "all", examCode: null, categoryCode: null, sessionId, page: 1 }) });
  }, { isolationLevel: "RepeatableRead" });
}
