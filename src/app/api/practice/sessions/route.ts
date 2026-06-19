import { getCurrentUser } from "@/lib/auth";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type CreateSessionBody = {
  examCode?: string;
  questionCount?: number;
};

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (!["student", "teacher"].includes(user.role.name)) return forbidden();

  let body: CreateSessionBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const examCode = body.examCode?.trim();
  const questionCount = body.questionCount ?? 10;

  if (!examCode) return badRequest("examCode is required");
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 50) {
    return badRequest("questionCount must be an integer between 1 and 50");
  }

  const exam = await prisma.exam.findUnique({ where: { code: examCode } });
  if (!exam || !exam.isActive) return badRequest("Unknown or inactive exam");

  const candidates = await prisma.question.findMany({
    where: {
      examId: exam.id,
      status: "published",
      deletedAt: null,
    },
    select: { id: true },
  });

  if (candidates.length < questionCount) {
    return badRequest("Not enough published questions", {
      available: candidates.length,
      requested: questionCount,
    });
  }

  const selected = candidates
    .map((question) => ({ question, random: Math.random() }))
    .sort((a, b) => a.random - b.random)
    .slice(0, questionCount)
    .map(({ question }, index) => ({
      questionId: question.id,
      orderNo: index + 1,
    }));

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.practiceSession.create({
      data: {
        userId: user.id,
        examId: exam.id,
        questionCount,
      },
    });

    await tx.practiceSessionQuestion.createMany({
      data: selected.map((question) => ({
        sessionId: created.id,
        ...question,
      })),
    });

    return created;
  });

  return Response.json(
    {
      sessionId: session.id,
      exam: { code: exam.code, name: exam.name },
      questionCount: session.questionCount,
      status: session.status,
    },
    { status: 201 },
  );
}
