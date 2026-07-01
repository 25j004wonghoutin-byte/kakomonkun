import { getCurrentUser } from "@/lib/auth";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AnswerBody = {
  questionId?: string;
  selectedChoiceId?: string;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!["student", "teacher"].includes(user.role.name)) return forbidden();

  const where = {
    status: "published",
    deletedAt: null,
  };

  const questionCount = await prisma.question.count({ where });
  if (questionCount < 1) return notFound("Daily question is not available");

  const [question] = await prisma.question.findMany({
    where,
    orderBy: { id: "asc" },
    skip: Math.floor(Math.random() * questionCount),
    take: 1,
    select: {
      id: true,
      questionText: true,
      imagePath: true,
      explanation: true,
      exam: { select: { code: true, name: true } },
      category: { select: { code: true, name: true } },
      choices: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          choiceLabel: true,
          choiceText: true,
        },
      },
    },
  });

  if (!question) return notFound("Daily question is not available");

  return Response.json({
    question: {
      id: question.id,
      text: question.questionText,
      imagePath: question.imagePath,
      explanation: question.explanation,
      exam: question.exam,
      category: question.category,
      choices: question.choices.map((choice) => ({
        id: choice.id,
        label: choice.choiceLabel,
        text: choice.choiceText,
      })),
    },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!["student", "teacher"].includes(user.role.name)) return forbidden();

  let body: AnswerBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.questionId || !body.selectedChoiceId) {
    return badRequest("questionId and selectedChoiceId are required");
  }

  const question = await prisma.question.findUnique({
    where: { id: body.questionId },
    select: {
      id: true,
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

  const selectedChoice = question.choices.find(
    (choice) => choice.id === body.selectedChoiceId,
  );
  if (!selectedChoice) {
    return badRequest("Selected choice does not belong to the question");
  }

  const correctChoice = question.choices.find((choice) => choice.isCorrect);
  if (!correctChoice) {
    return notFound("Correct choice is not configured");
  }

  return Response.json({
    isCorrect: selectedChoice.isCorrect,
    explanation: question.explanation,
    correctChoice: {
      id: correctChoice.id,
      label: correctChoice.choiceLabel,
      text: correctChoice.choiceText,
    },
  });
}
