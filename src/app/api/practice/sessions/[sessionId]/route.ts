import { getCurrentUser } from "@/lib/auth";
import { forbidden, notFound, unauthorized } from "@/lib/http";
import { getQuestionPresentation } from "@/lib/official-question";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { sessionId } = await context.params;
  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
      exam: true,
      sessionQuestions: {
        orderBy: { orderNo: "asc" },
        include: {
          question: {
            include: {
              category: {
                select: {
                  code: true,
                  name: true,
                },
              },
              choices: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  choiceLabel: true,
                  choiceText: true,
                  sortOrder: true,
                  isCorrect: true,
                },
              },
            },
          },
        },
      },
      answers: {
        orderBy: { orderNo: "asc" },
        select: {
          questionId: true,
          selectedChoiceId: true,
          isCorrect: true,
          orderNo: true,
        },
      },
    },
  });

  if (!session) return notFound("Practice session not found");
  if (session.userId !== user.id && user.role.name !== "teacher") return forbidden();

  const answers = new Map(session.answers.map((answer) => [answer.questionId, answer]));

  return Response.json({
    id: session.id,
    status: session.status,
    exam: { code: session.exam.code, name: session.exam.name },
    questionCount: session.questionCount,
    answeredCount: session.answeredCount,
    correctCount: session.correctCount,
    earnedPoints: session.earnedPoints,
    questions: session.sessionQuestions.map(({ orderNo, question }) => ({
      id: question.id,
      orderNo,
      text: question.questionText,
      imagePath: question.imagePath,
      category: question.category,
      ...getQuestionPresentation(question),
      choices: question.choices.map((choice) => ({
        id: choice.id,
        choiceLabel: choice.choiceLabel,
        choiceText: choice.choiceText,
        sortOrder: choice.sortOrder,
      })),
      answer: buildAnswer(question.choices, answers.get(question.id)),
    })),
  });
}

function buildAnswer(
  choices: Array<{
    id: string;
    choiceLabel: string;
    choiceText: string;
    isCorrect: boolean;
  }>,
  answer:
    | {
        selectedChoiceId: string;
        isCorrect: boolean;
        orderNo: number;
      }
    | undefined,
) {
  if (!answer) return null;

  const correctChoice = choices.find((choice) => choice.isCorrect);

  return {
    ...answer,
    correctChoice: correctChoice
      ? {
          id: correctChoice.id,
          choiceLabel: correctChoice.choiceLabel,
          choiceText: correctChoice.choiceText,
        }
      : null,
  };
}
