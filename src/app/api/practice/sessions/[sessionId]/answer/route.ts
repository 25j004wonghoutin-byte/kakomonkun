import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { LearningEventError, savePracticeAnswer } from "@/lib/titles/learning-events";

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

  try {
    const result = await prisma.$transaction((tx) => savePracticeAnswer(
      tx, { id: user.id, isStudent: user.role.name === "student" }, sessionId,
      { questionId: body.questionId!, selectedChoiceId: body.selectedChoiceId! }, new Date(),
    ), { timeout: 30_000 });
    return Response.json(result);
  } catch (cause) {
    if (cause instanceof LearningEventError) return Response.json({ error: cause.message }, { status: cause.status });
    throw cause;
  }
}
