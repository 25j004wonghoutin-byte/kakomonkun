import { getCurrentUser } from "@/lib/auth";
import { notFound, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  evaluateQuizQuestion,
  findDailyQuizQuestion,
  quizQuestionSelect,
  toPublicQuizQuestion,
} from "@/lib/quiz-question";
import { getTokyoDate } from "@/lib/tokyo-date";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const dateString = getTokyoDate();
  const answerDate = new Date(`${dateString}T00:00:00.000Z`);
  const storedAnswer = await prisma.dailyQaAnswer.findUnique({
    where: {
      userId_answerDate: {
        userId: user.id,
        answerDate,
      },
    },
    select: {
      selectedChoiceId: true,
      answerPointAwarded: true,
      correctPointAwarded: true,
      question: { select: quizQuestionSelect },
    },
  });

  if (storedAnswer) {
    const evaluation = evaluateQuizQuestion(
      storedAnswer.question,
      storedAnswer.selectedChoiceId,
    );
    if (evaluation.status === "missing-correct-choice") {
      return notFound("Correct choice is not configured");
    }
    if (evaluation.status === "invalid-choice") {
      return notFound("Stored choice is not available");
    }

    return Response.json({
      date: dateString,
      question: toPublicQuizQuestion(storedAnswer.question),
      answer: {
        ...evaluation.answer,
        awardedPoints:
          Number(storedAnswer.answerPointAwarded) +
          Number(storedAnswer.correctPointAwarded),
      },
      totalPoints: user.studentProfile?.totalPoints ?? null,
    });
  }

  const question = await findDailyQuizQuestion(dateString);
  if (!question) return notFound("Daily question is not available");

  return Response.json({
    date: dateString,
    question: toPublicQuizQuestion(question),
    answer: null,
    totalPoints: user.studentProfile?.totalPoints ?? null,
  });
}
