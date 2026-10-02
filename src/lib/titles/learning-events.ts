import type { Prisma } from "../../../prisma/generated/client";
import { getPracticeCompletionPoints } from "../practice-config";
import { getTokyoDate } from "../tokyo-date";
import { lockTitleOwner } from "./unlocks";
import { recordTitleActivity } from "./activity";

export class LearningEventError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

type LearningUser = { id: string; isStudent: boolean };

/** 回答保存と同じtransaction内で呼ぶ。教師には呼ばない。 */
export async function recordTitleAnswer(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<void> {
  await recordTitleActivity(tx, userId, { now, hasAnswered: true });
}

async function lockPracticeSession(tx: Prisma.TransactionClient, user: LearningUser, sessionId: string) {
  await lockTitleOwner(tx, user.id);
  await tx.$queryRaw`SELECT id FROM public.practice_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
  const session = await tx.practiceSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new LearningEventError(404, "Practice session not found");
  if (session.userId !== user.id) throw new LearningEventError(403, "Forbidden");
  return session;
}

export async function savePracticeAnswer(
  tx: Prisma.TransactionClient,
  user: LearningUser,
  sessionId: string,
  value: { questionId: string; selectedChoiceId: string },
  now: Date,
) {
  const session = await lockPracticeSession(tx, user, sessionId);
  if (session.status !== "in_progress") throw new LearningEventError(409, "Practice session is not active");
  const key = { sessionId, questionId: value.questionId };
  const sessionQuestion = await tx.practiceSessionQuestion.findUnique({ where: { sessionId_questionId: key } });
  if (!sessionQuestion) throw new LearningEventError(400, "Question is not part of this session");
  const existing = await tx.practiceAnswer.findUnique({ where: { sessionId_questionId: key } });
  if (existing) throw new LearningEventError(409, "Question has already been answered");
  const question = await tx.question.findUnique({
    where: { id: value.questionId },
    select: { explanation: true, choices: { orderBy: { sortOrder: "asc" }, select: { id: true, choiceLabel: true, choiceText: true, isCorrect: true } } },
  });
  if (!question) throw new LearningEventError(404, "Question not found");
  const choice = question.choices.find((item) => item.id === value.selectedChoiceId);
  if (!choice) throw new LearningEventError(400, "Selected choice does not belong to the question");
  const correct = question.choices.find((item) => item.isCorrect);
  if (!correct) throw new LearningEventError(404, "Correct choice is not configured");
  await tx.practiceAnswer.create({ data: { ...key, selectedChoiceId: choice.id, isCorrect: choice.isCorrect, orderNo: sessionQuestion.orderNo, answeredAt: now } });
  await tx.practiceSession.update({ where: { id: sessionId }, data: { answeredCount: { increment: 1 }, correctCount: choice.isCorrect ? { increment: 1 } : undefined } });
  if (user.isStudent) await recordTitleAnswer(tx, user.id, now);
  return { selectedChoiceId: choice.id, isCorrect: choice.isCorrect, explanation: question.explanation, correctChoice: { id: correct.id, choiceLabel: correct.choiceLabel, choiceText: correct.choiceText } };
}

export async function finishPracticeSession(tx: Prisma.TransactionClient, user: LearningUser, sessionId: string, now: Date) {
  const session = await lockPracticeSession(tx, user, sessionId);
  if (session.status === "completed") {
    return { sessionId: session.id, correctCount: session.correctCount, answeredCount: session.answeredCount, earnedPoints: session.earnedPoints, alreadyCompleted: true };
  }
  if (session.status !== "in_progress") throw new LearningEventError(409, "Practice session cannot be completed");
  const transactionDate = new Date(`${getTokyoDate(now)}T00:00:00.000Z`);
  const answeredAllQuestions = session.questionCount > 0 && session.answeredCount === session.questionCount;
  const configured = getPracticeCompletionPoints(session.questionCount);
  const rewardedToday = user.isStudent ? await tx.pointTransaction.count({ where: { userId: user.id, reason: "practice_complete", transactionDate } }) : 0;
  const completionPoints = user.isStudent && answeredAllQuestions && configured > 0 && rewardedToday < 2 ? configured : 0;
  const correctBonusPoints = user.isStudent && answeredAllQuestions ? Math.floor(session.correctCount / 10) : 0;
  const earnedPoints = completionPoints + correctBonusPoints;
  // 同じミリ秒・ロック待ちで時刻が逆転しても、確定した終了順を維持する。
  const previous = await tx.practiceSession.findFirst({ where: { userId: user.id, status: "completed" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } });
  const completedAt = new Date(Math.max(+now, previous?.completedAt ? +previous.completedAt + 1 : +now));
  const result = await tx.practiceSession.update({ where: { id: sessionId }, data: { status: "completed", completedAt, earnedPoints } });
  if (completionPoints > 0) await tx.pointTransaction.create({ data: { userId: user.id, points: completionPoints, reason: "practice_complete", sourceType: "practice", sourceId: sessionId, transactionDate, description: "過去問練習完了" } });
  if (correctBonusPoints > 0) await tx.pointTransaction.create({ data: { userId: user.id, points: correctBonusPoints, reason: "practice_correct_bonus", sourceType: "practice", sourceId: sessionId, transactionDate, description: "過去問練習10問正解ボーナス" } });
  if (user.isStudent) {
    await tx.studentProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, totalPoints: earnedPoints, totalPracticeCount: 1, totalCorrectCount: session.correctCount, totalAnswerCount: session.answeredCount },
      update: { totalPoints: { increment: earnedPoints }, totalPracticeCount: { increment: 1 }, totalCorrectCount: { increment: session.correctCount }, totalAnswerCount: { increment: session.answeredCount } },
    });
    await recordTitleActivity(tx, user.id, { now });
  }
  return { sessionId: result.id, correctCount: result.correctCount, answeredCount: result.answeredCount, earnedPoints: result.earnedPoints, answeredAllQuestions, completionPoints, correctBonusPoints };
}
