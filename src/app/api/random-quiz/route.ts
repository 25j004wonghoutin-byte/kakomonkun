import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { LearningEventError } from "@/lib/titles/learning-events";
import { issueRandomAttempt, saveRandomAnswer } from "@/lib/titles/random-attempts";
import {
  evaluateQuizQuestion,
  findRandomQuizQuestion,
  quizQuestionSelect,
  toPublicQuizQuestion,
} from "@/lib/quiz-question";

export const dynamic = "force-dynamic";

type AnswerBody = {
  attemptId?: string;
  questionId?: string;
  selectedChoiceId?: string;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const question = await findRandomQuizQuestion();
  if (!question) return notFound("Random question is not available");

  const attempt = user.role.name === "student"
    ? await prisma.$transaction((tx) => issueRandomAttempt(tx, user.id, question.id, new Date()))
    : { attemptId: null };
  return Response.json({ question: toPublicQuizQuestion(question), ...attempt });
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

  if (user.role.name === "student") {
    if (!body.attemptId || !body.selectedChoiceId) return badRequest("attemptId and selectedChoiceId are required");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const saved = await saveRandomAnswer(tx, user.id, { attemptId: body.attemptId!, selectedChoiceId: body.selectedChoiceId! }, new Date());
        const question = await tx.question.findUnique({ where: { id: saved.questionId }, select: quizQuestionSelect });
        if (!question) throw new LearningEventError(404, "Question not found");
        const evaluation = evaluateQuizQuestion(question, saved.selectedChoiceId);
        if (evaluation.status !== "ok") throw new LearningEventError(404, "Stored answer is not available");
        return { answer: { ...evaluation.answer, isCorrect: saved.isCorrect }, alreadyAnswered: saved.alreadyAnswered };
      }, { timeout: 30_000 });
      return Response.json(result);
    } catch (cause) {
      if (cause instanceof LearningEventError) return Response.json({ error: cause.message }, { status: cause.status });
      throw cause;
    }
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
