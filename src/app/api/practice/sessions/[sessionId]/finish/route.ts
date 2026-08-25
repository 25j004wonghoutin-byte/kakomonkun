import { getCurrentUser } from "@/lib/auth";
import { conflict, forbidden, notFound, unauthorized } from "@/lib/http";
import { isPracticeQuestionCount } from "@/lib/practice-config";
import { prisma } from "@/lib/prisma";
import { getTokyoDayRange } from "@/lib/tokyo-date";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { sessionId } = await context.params;
  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) return notFound("Practice session not found");
  if (session.userId !== user.id) return forbidden();
  if (session.status === "completed") {
    return Response.json({
      sessionId: session.id,
      correctCount: session.correctCount,
      answeredCount: session.answeredCount,
      earnedPoints: session.earnedPoints,
      alreadyCompleted: true,
    });
  }
  if (session.status !== "in_progress") return conflict("Practice session cannot be completed");
  if (session.answeredCount === 0) return conflict("Answer at least one question before finishing");

  const { dateString } = getTokyoDayRange();
  const transactionDate = new Date(`${dateString}T00:00:00.000Z`);
  const isStudent = user.role.name === "student";
  const answeredAllQuestions = session.answeredCount === session.questionCount;
  const isRewardEligibleSession =
    answeredAllQuestions && isPracticeQuestionCount(session.questionCount);
  const rewardedToday = isStudent
    ? await prisma.pointTransaction.count({
        where: {
          userId: user.id,
          reason: "practice_complete",
          transactionDate,
        },
      })
    : 0;

  const completionPoints = isStudent && isRewardEligibleSession && rewardedToday < 2 ? 5 : 0;
  const correctBonusPoints = isStudent ? Math.floor(session.correctCount / 10) : 0;
  const earnedPoints = completionPoints + correctBonusPoints;

  const result = await prisma.$transaction(async (tx) => {
    const completed = await tx.practiceSession.update({
      where: { id: session.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        earnedPoints,
      },
    });

    if (completionPoints > 0) {
      await tx.pointTransaction.create({
        data: {
          userId: user.id,
          points: completionPoints,
          reason: "practice_complete",
          sourceType: "practice",
          sourceId: session.id,
          transactionDate,
          description: "過去問練習完了",
        },
      });
    }

    if (correctBonusPoints > 0) {
      await tx.pointTransaction.create({
        data: {
          userId: user.id,
          points: correctBonusPoints,
          reason: "practice_correct_bonus",
          sourceType: "practice",
          sourceId: session.id,
          transactionDate,
          description: "過去問練習10問正解ボーナス",
        },
      });
    }

    if (isStudent) {
      await tx.studentProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          totalPoints: earnedPoints,
          totalPracticeCount: 1,
          totalCorrectCount: session.correctCount,
          totalAnswerCount: session.answeredCount,
        },
        update: {
          totalPoints: { increment: earnedPoints },
          totalPracticeCount: { increment: 1 },
          totalCorrectCount: { increment: session.correctCount },
          totalAnswerCount: { increment: session.answeredCount },
        },
      });
    }

    return completed;
  });

  return Response.json({
    sessionId: result.id,
    correctCount: result.correctCount,
    answeredCount: result.answeredCount,
    earnedPoints: result.earnedPoints,
    answeredAllQuestions,
    completionPoints,
    correctBonusPoints,
  });
}
