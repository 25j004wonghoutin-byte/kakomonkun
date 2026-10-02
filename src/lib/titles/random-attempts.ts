import type { Prisma } from "../../../prisma/generated/client";
import { getTokyoDate } from "../tokyo-date";
import { LearningEventError, recordTitleAnswer } from "./learning-events";
import { lockTitleOwner } from "./unlocks";

export async function issueRandomAttempt(tx: Prisma.TransactionClient, userId: string, questionId: string, now: Date): Promise<{ attemptId: string }> {
  const attempt = await tx.randomQuizAttempt.create({ data: { userId, questionId, issuedAt: now }, select: { id: true } });
  return { attemptId: attempt.id };
}

export async function saveRandomAnswer(
  tx: Prisma.TransactionClient,
  userId: string,
  value: { attemptId: string; selectedChoiceId: string },
  now: Date,
): Promise<{ alreadyAnswered: boolean; questionId: string; selectedChoiceId: string; isCorrect: boolean }> {
  await lockTitleOwner(tx, userId);
  const attempt = await tx.randomQuizAttempt.findUnique({ where: { id: value.attemptId } });
  if (!attempt || attempt.userId !== userId) throw new LearningEventError(404, "Random attempt not found");
  if (attempt.answeredAt !== null && attempt.selectedChoiceId !== null && attempt.isCorrect !== null) {
    return { alreadyAnswered: true, questionId: attempt.questionId, selectedChoiceId: attempt.selectedChoiceId, isCorrect: attempt.isCorrect };
  }
  const question = await tx.question.findUnique({ where: { id: attempt.questionId }, select: { choices: { select: { id: true, isCorrect: true } } } });
  if (!question) throw new LearningEventError(404, "Question not found");
  const choice = question.choices.find((item) => item.id === value.selectedChoiceId);
  if (!choice) throw new LearningEventError(400, "Selected choice does not belong to the question");
  if (!question.choices.some((item) => item.isCorrect)) throw new LearningEventError(404, "Correct choice is not configured");
  const sequence = await tx.randomQuizAttempt.aggregate({ where: { userId }, _max: { answerSequence: true } });
  await tx.randomQuizAttempt.update({ where: { id: attempt.id }, data: {
    selectedChoiceId: choice.id, isCorrect: choice.isCorrect, answeredAt: now,
    answerDate: new Date(`${getTokyoDate(now)}T00:00:00.000Z`), answerSequence: (sequence._max.answerSequence ?? 0) + 1,
  } });
  await recordTitleAnswer(tx, userId, now);
  return { alreadyAnswered: false, questionId: attempt.questionId, selectedChoiceId: choice.id, isCorrect: choice.isCorrect };
}
