import { getCurrentUser } from "@/lib/auth";
import { conflict, forbidden, notFound, unauthorized } from "@/lib/http";
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

  const { dateString, start, end } = getTokyoDayRange();
  const completedToday = await prisma.practiceSession.count({
    where: {
      userId: user.id,
      status: "completed",
      completedAt: { gte: start, lt: end },
    },
  });

  const completionPoints = completedToday < 2 ? 5 : 0;
  const correctBonusPoints = Math.floor(session.correctCount / 10);
  const earnedPoints = completionPoints + correctBonusPoints;
  const transactionDate = new Date(`${dateString}T00:00:00.000Z`);

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

    if (user.studentProfile) {
      await tx.studentProfile.update({
        where: { userId: user.id },
        data: {
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
  });
}
