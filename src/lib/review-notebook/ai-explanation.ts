import type { PrismaClient } from "../../../prisma/generated/client";
import { ReviewNotebookError, type ReviewActor } from "./contract";
import type { ReviewAiInput, ReviewAiResult } from "./ai-contract";
import { assertReviewStudent } from "./rules";
import { questionVersionOf } from "./version";

const missing = () => new ReviewNotebookError("not_found", 404, "問題が見つからないか、現在は公開されていません。");
const stale = () => new ReviewNotebookError("stale_review", 409, "問題や復習状況が更新されました。再読み込みしてください。");

export async function explainReviewAnswer(
  db: PrismaClient, actor: ReviewActor, itemId: string, input: ReviewAiInput,
  generate: (input: { questionId: string; userId: string }) => Promise<ReviewAiResult | null>,
): Promise<ReviewAiResult> {
  assertReviewStudent(actor);
  const validate = () => db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { status: true, deletedAt: true, role: { select: { name: true } } } });
    assertReviewStudent(user ? { id: actor.id, roleName: user.role.name, status: user.status, deletedAt: user.deletedAt } : null);
    const item = await tx.reviewNotebookItem.findUnique({
      where: { id: itemId, userId: actor.id },
      select: { revision: true, question: { select: { id: true, status: true, deletedAt: true, updatedAt: true, choices: { select: { id: true, updatedAt: true } } } } },
    });
    if (!item || item.question.status !== "published" || item.question.deletedAt !== null) throw missing();
    if (item.revision !== input.answerRevision || questionVersionOf(item.question) !== input.questionVersion) throw stale();
    const answer = await tx.reviewNotebookAnswer.findFirst({
      where: { itemId, userId: actor.id, questionVersion: input.questionVersion, expectedRevision: input.answerRevision - 1 },
      select: { requestId: true },
    });
    if (!answer) throw new ReviewNotebookError("answer_required", 409, "回答を保存してからAI解説をご利用ください。再読み込みしてください。");
    return item.question.id;
  }, { isolationLevel: "RepeatableRead" });

  const questionId = await validate();
  const result = await generate({ questionId, userId: actor.id });
  // A slow provider must not release a result after the question or access changed.
  await validate();
  if (!result) throw missing();
  return { explanation: result.explanation, fromCache: result.fromCache };
}
