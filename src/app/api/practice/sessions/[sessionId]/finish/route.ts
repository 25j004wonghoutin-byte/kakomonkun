import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { finishPracticeSession, LearningEventError } from "@/lib/titles/learning-events";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { sessionId } = await context.params;
  try {
    const result = await prisma.$transaction((tx) => finishPracticeSession(
      tx, { id: user.id, isStudent: user.role.name === "student" }, sessionId, new Date(),
    ), { timeout: 30_000 });
    return Response.json(result);
  } catch (cause) {
    if (cause instanceof LearningEventError) return Response.json({ error: cause.message }, { status: cause.status });
    throw cause;
  }
}
