import { getCurrentUser } from "@/lib/auth";
import { forbidden, notFound, unauthorized } from "@/lib/http";
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
              choices: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  choiceLabel: true,
                  choiceText: true,
                  sortOrder: true,
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
      choices: question.choices,
      answer: answers.get(question.id) ?? null,
    })),
  });
}
