import { getCurrentUser } from "@/lib/auth";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type AnswerBody = {
  questionId?: string;
  selectedChoiceId?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { sessionId } = await context.params;
  let body: AnswerBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.questionId || !body.selectedChoiceId) {
    return badRequest("questionId and selectedChoiceId are required");
  }

  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return notFound("Practice session not found");
  if (session.userId !== user.id) return forbidden();
  if (session.status !== "in_progress") return conflict("Practice session is not active");

  const sessionQuestion = await prisma.practiceSessionQuestion.findUnique({
    where: {
      sessionId_questionId: {
        sessionId,
        questionId: body.questionId,
      },
    },
  });
  if (!sessionQuestion) return badRequest("Question is not part of this session");

  const existingAnswer = await prisma.practiceAnswer.findUnique({
    where: {
      sessionId_questionId: {
        sessionId,
        questionId: body.questionId,
      },
    },
  });
  if (existingAnswer) return conflict("Question has already been answered");

  const question = await prisma.question.findUnique({
    where: { id: body.questionId },
    select: {
      explanation: true,
      choices: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          choiceLabel: true,
          choiceText: true,
          isCorrect: true,
        },
      },
    },
  });
  if (!question) return notFound("Question not found");

  const choice = question.choices.find((item) => item.id === body.selectedChoiceId);
  if (!choice) {
    return badRequest("Selected choice does not belong to the question");
  }

  const correctChoice = question.choices.find((item) => item.isCorrect);
  if (!correctChoice) {
    return notFound("Correct choice is not configured");
  }

  await prisma.$transaction([
    prisma.practiceAnswer.create({
      data: {
        sessionId,
        questionId: body.questionId,
        selectedChoiceId: choice.id,
        isCorrect: choice.isCorrect,
        orderNo: sessionQuestion.orderNo,
      },
    }),
    prisma.practiceSession.update({
      where: { id: sessionId },
      data: {
        answeredCount: { increment: 1 },
        correctCount: choice.isCorrect ? { increment: 1 } : undefined,
      },
    }),
  ]);

  return Response.json({
    selectedChoiceId: choice.id,
    isCorrect: choice.isCorrect,
    explanation: question.explanation,
    correctChoice: {
      id: correctChoice.id,
      choiceLabel: correctChoice.choiceLabel,
      choiceText: correctChoice.choiceText,
    },
  });
}
