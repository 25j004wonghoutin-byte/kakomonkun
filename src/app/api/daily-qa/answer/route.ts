import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  evaluateQuizQuestion,
  findDailyQuizQuestion,
  quizQuestionSelect,
  toPublicQuizQuestion,
} from "@/lib/quiz-question";
import { getTokyoDate } from "@/lib/tokyo-date";

export const dynamic = "force-dynamic";

type AnswerBody = {
  questionId?: string;
  selectedChoiceId?: string;
};

async function findStoredAnswer(userId: string, answerDate: Date) {
  return prisma.dailyQaAnswer.findUnique({
    where: {
      userId_answerDate: {
        userId,
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
}

async function getCurrentTotalPoints(userId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { totalPoints: true },
  });
  return profile?.totalPoints ?? null;
}

function isUniqueConstraintError(cause: unknown) {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "P2002"
  );
}

function storedAnswerPayload(
  storedAnswer: NonNullable<Awaited<ReturnType<typeof findStoredAnswer>>>,
) {
  const evaluation = evaluateQuizQuestion(
    storedAnswer.question,
    storedAnswer.selectedChoiceId,
  );
  if (evaluation.status !== "ok") return null;

  return {
    question: toPublicQuizQuestion(storedAnswer.question),
    answer: {
      ...evaluation.answer,
      awardedPoints:
        Number(storedAnswer.answerPointAwarded) +
        Number(storedAnswer.correctPointAwarded),
    },
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let body: AnswerBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.questionId || !body.selectedChoiceId) {
    return badRequest("questionId and selectedChoiceId are required");
  }

  const dateString = getTokyoDate();
  const answerDate = new Date(`${dateString}T00:00:00.000Z`);
  const existingAnswer = await findStoredAnswer(user.id, answerDate);

  if (existingAnswer) {
    const payload = storedAnswerPayload(existingAnswer);
    if (!payload) return notFound("Stored answer is not available");

    return Response.json({
      date: dateString,
      ...payload,
      totalPoints: await getCurrentTotalPoints(user.id),
      alreadyAnswered: true,
    });
  }

  const question = await findDailyQuizQuestion(dateString);
  if (!question) return notFound("Daily question is not available");
  if (question.id !== body.questionId) {
    return badRequest("This is not today's question");
  }

  const evaluation = evaluateQuizQuestion(question, body.selectedChoiceId);
  if (evaluation.status === "invalid-choice") {
    return badRequest("Selected choice does not belong to the question");
  }
  if (evaluation.status === "missing-correct-choice") {
    return notFound("Correct choice is not configured");
  }

  const awardsPoints = Boolean(user.studentProfile);
  const awardedPoints = awardsPoints ? (evaluation.answer.isCorrect ? 2 : 1) : 0;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const dailyAnswer = await tx.dailyQaAnswer.create({
        data: {
          userId: user.id,
          questionId: question.id,
          selectedChoiceId: evaluation.answer.selectedChoiceId,
          isCorrect: evaluation.answer.isCorrect,
          answerDate,
          answerPointAwarded: awardsPoints,
          correctPointAwarded: awardsPoints && evaluation.answer.isCorrect,
        },
      });

      if (!awardsPoints) {
        return { totalPoints: null };
      }

      await tx.pointTransaction.create({
        data: {
          userId: user.id,
          points: 1,
          reason: "daily_qa_answer",
          sourceType: "daily_qa",
          sourceId: dailyAnswer.id,
          transactionDate: answerDate,
          description: "一問一答に回答",
        },
      });

      if (evaluation.answer.isCorrect) {
        await tx.pointTransaction.create({
          data: {
            userId: user.id,
            points: 1,
            reason: "daily_qa_correct",
            sourceType: "daily_qa",
            sourceId: dailyAnswer.id,
            transactionDate: answerDate,
            description: "一問一答に正解",
          },
        });
      }

      const profile = await tx.studentProfile.update({
        where: { userId: user.id },
        data: { totalPoints: { increment: awardedPoints } },
        select: { totalPoints: true },
      });

      return profile;
    });

    return Response.json({
      date: dateString,
      question: toPublicQuizQuestion(question),
      answer: {
        ...evaluation.answer,
        awardedPoints,
      },
      totalPoints: result.totalPoints,
      alreadyAnswered: false,
    });
  } catch (cause) {
    if (!isUniqueConstraintError(cause)) throw cause;

    const storedAnswer = await findStoredAnswer(user.id, answerDate);
    if (!storedAnswer) throw cause;
    const payload = storedAnswerPayload(storedAnswer);
    if (!payload) return notFound("Stored answer is not available");

    return Response.json({
      date: dateString,
      ...payload,
      totalPoints: await getCurrentTotalPoints(user.id),
      alreadyAnswered: true,
    });
  }
}
