import { getCurrentUser } from "@/lib/auth";
import { getOrCreateAiExplanation } from "@/lib/ai-explanations";
import { isDevTestAuthEnabled } from "@/lib/dev-auth";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type AiExplanationBody = {
  questionId?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { sessionId } = await context.params;
  let body: AiExplanationBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.questionId) {
    return badRequest("questionId is required");
  }

  const [session, sessionQuestion, answer] = await Promise.all([
    prisma.practiceSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    }),
    prisma.practiceSessionQuestion.findUnique({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId: body.questionId,
        },
      },
      select: { id: true },
    }),
    prisma.practiceAnswer.findUnique({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId: body.questionId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (!session) return notFound("Practice session not found");
  if (session.userId !== user.id) return forbidden();
  if (!sessionQuestion) return badRequest("Question is not part of this session");
  if (!answer) return conflict("Question has not been answered");

  try {
    const result = await getOrCreateAiExplanation({
      questionId: body.questionId,
      userId: user.id,
    });

    if (!result) return notFound("Question not found");

    return Response.json(result);
  } catch (cause) {
    console.error("Failed to generate AI explanation", cause);
    const details = cause instanceof Error ? cause.message : "Unknown error";
    const message = isDevTestAuthEnabled()
      ? `AI解説APIの呼び出しに失敗しました。Gemini APIキーの権限やモデル設定を確認してください。詳細: ${details}`
      : "AI解説を取得できませんでした。しばらくしてからもう一度お試しください。";

    return Response.json({ error: message }, { status: 502 });
  }
}
