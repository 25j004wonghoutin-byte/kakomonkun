import { getCurrentUser } from "@/lib/auth";
import { isDevTestAuthEnabled } from "@/lib/dev-auth";
import { getOrCreateAiExplanation } from "@/lib/ai-explanations";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/http";

type AiExplanationBody = {
  questionId?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!["student", "teacher"].includes(user.role.name)) return forbidden();

  let body: AiExplanationBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.questionId) {
    return badRequest("questionId is required");
  }

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
