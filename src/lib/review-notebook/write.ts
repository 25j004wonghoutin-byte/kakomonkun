import type { Prisma } from "../../../prisma/generated/client";
import { lockTitleOwner } from "@/lib/titles/unlocks";
import { ReviewNotebookError, type ReviewActor, type ReviewAnswerInput, type ReviewAnswerResult, type ReviewStatus } from "./contract";
import { assertReviewStudent, nextReviewStatus } from "./rules";
import { questionVersionOf } from "./version";

export async function recordWrongPracticeAnswer(tx: Prisma.TransactionClient, input: { userId: string; questionId: string; answeredAt: Date }): Promise<void> {
  const { userId, questionId, answeredAt } = input;
  await tx.reviewNotebookItem.upsert({
    where: { userId_questionId: { userId, questionId } },
    create: { userId, questionId, status: "unreviewed", firstWrongAt: answeredAt, lastWrongAt: answeredAt, revision: 1 },
    update: { status: "unreviewed", lastWrongAt: answeredAt, revision: { increment: 1 } },
  });
}

const missing = () => new ReviewNotebookError("not_found", 404, "問題が見つからないか、現在は公開されていません。");
const conflict = () => new ReviewNotebookError("stale_review", 409, "問題や復習状況が更新されました。再読み込みしてください。");

export async function saveReviewAnswer(tx: Prisma.TransactionClient, actor: ReviewActor, itemId: string, input: ReviewAnswerInput, now: Date): Promise<ReviewAnswerResult> {
  assertReviewStudent(actor);
  await lockTitleOwner(tx, actor.id);
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { status: true, deletedAt: true, role: { select: { name: true } } } });
  assertReviewStudent(user ? { id: actor.id, roleName: user.role.name, status: user.status, deletedAt: user.deletedAt } : null);
  await tx.$queryRaw`SELECT id FROM public.review_notebook_items WHERE id=${itemId}::uuid AND user_id=${actor.id}::uuid FOR UPDATE`;
  const item = await tx.reviewNotebookItem.findUnique({ where: { id: itemId, userId: actor.id } });
  if (!item) throw missing();
  await tx.$queryRaw`SELECT id FROM public.questions WHERE id=${item.questionId}::uuid FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM public.question_choices WHERE question_id=${item.questionId}::uuid ORDER BY id FOR SHARE`;
  const question = await tx.question.findUnique({ where: { id: item.questionId }, include: { choices: { orderBy: { sortOrder: "asc" } } } });
  if (!question || question.status !== "published" || question.deletedAt !== null) throw missing();
  const receipt = await tx.reviewNotebookAnswer.findUnique({ where: { userId_requestId: { userId: actor.id, requestId: input.requestId } } });
  if (receipt) {
    if (receipt.itemId !== itemId || receipt.expectedRevision !== input.expectedRevision || receipt.questionVersion !== input.questionVersion || receipt.selectedChoiceId !== input.selectedChoiceId) throw conflict();
    return { ...(receipt.result as unknown as ReviewAnswerResult), replayed: true };
  }
  if (item.revision !== input.expectedRevision || questionVersionOf(question) !== input.questionVersion || item.revision >= 2147483647) throw conflict();
  const choice = question.choices.find(value => value.id === input.selectedChoiceId);
  if (!choice) throw new ReviewNotebookError("invalid_choice", 400, "選択肢を確認してください。");
  const correctChoices = question.choices.filter(value => value.isCorrect);
  if (correctChoices.length !== 1) throw new ReviewNotebookError("invalid_question", 500, "この問題は採点できません。一覧へ戻ってください。");
  const correct = correctChoices[0];
  const saved = await tx.reviewNotebookItem.update({ where: { id: itemId }, data: { status: nextReviewStatus(choice.isCorrect), revision: { increment: 1 }, lastReviewedAt: now } });
  const result: ReviewAnswerResult = {
    item: { id: saved.id, status: saved.status as ReviewStatus, revision: saved.revision, lastReviewedAt: now.toISOString() },
    answer: { selectedChoiceId: choice.id, answeredAt: now.toISOString(), isCorrect: choice.isCorrect, explanation: question.explanation, correctChoice: { id: correct.id, label: correct.choiceLabel, text: correct.choiceText } },
    replayed: false,
  };
  await tx.reviewNotebookAnswer.create({ data: { userId: actor.id, itemId, ...input, isCorrect: choice.isCorrect, answeredAt: now, result: result as unknown as Prisma.InputJsonValue } });
  return result;
}
