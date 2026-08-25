import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  evaluateQuizQuestion,
  findRandomQuizQuestion,
  quizQuestionSelect,
  toPublicQuizQuestion,
} from "@/lib/quiz-question";

export const dynamic = "force-dynamic";

type AnswerBody = {
  questionId?: string;
  selectedChoiceId?: string;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const question = await findRandomQuizQuestion();
  if (!question) return notFound("Random question is not available");

  return Response.json({ question: toPublicQuizQuestion(question) });
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

  const question = await prisma.question.findFirst({
    where: {
      id: body.questionId,
      status: "published",
      deletedAt: null,
    },
    select: quizQuestionSelect,
  });
  if (!question) return notFound("Question not found");

  const evaluation = evaluateQuizQuestion(question, body.selectedChoiceId);
  if (evaluation.status === "invalid-choice") {
    return badRequest("Selected choice does not belong to the question");
  }
  if (evaluation.status === "missing-correct-choice") {
    return notFound("Correct choice is not configured");
  }

  return Response.json({ answer: evaluation.answer });
}
