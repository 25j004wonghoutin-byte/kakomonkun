import { createHash } from "node:crypto";
import { generateAiExplanation, getGeminiModelName } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

export async function getOrCreateAiExplanation({
  questionId,
  userId,
}: {
  questionId: string;
  userId: string;
}) {
  const modelName = getGeminiModelName();
  const metadata = await prisma.question.findUnique({
    where: { id: questionId },
    select: { imagePath: true },
  });
  if (!metadata) return null;

  // Image-aware entries must not reuse explanations generated from text alone.
  const cacheModelName = metadata.imagePath
    ? "image-v1:" + createHash("sha256").update(modelName).digest("hex")
    : modelName;
  const cachedExplanation = await prisma.aiExplanation.findUnique({
    where: {
      questionId_modelName: {
        questionId,
        modelName: cacheModelName,
      },
    },
  });

  if (cachedExplanation) {
    await logAiUsage({ userId, questionId });

    return {
      explanation: cachedExplanation.answerText,
      fromCache: true,
      modelName,
    };
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      exam: { select: { name: true } },
      category: { select: { name: true } },
      choices: {
        orderBy: { sortOrder: "asc" },
        select: {
          choiceLabel: true,
          choiceText: true,
          isCorrect: true,
        },
      },
    },
  });

  if (!question) {
    return null;
  }

  const generated = await generateAiExplanation({
    examName: question.exam.name,
    categoryName: question.category.name,
    questionText: question.questionText,
    imagePath: question.imagePath,
    officialExplanation: question.explanation,
    choices: question.choices,
  });

  const explanation = await createOrFindExplanation({
    questionId,
    modelName: cacheModelName,
    answerText: generated.answerText,
  });

  await logAiUsage({ userId, questionId });

  return {
    explanation: explanation.answerText,
    fromCache: explanation.answerText !== generated.answerText,
    modelName,
  };
}

async function logAiUsage({
  userId,
  questionId,
}: {
  userId: string;
  questionId: string;
}) {
  await prisma.aiUsageLog.create({
    data: {
      userId,
      questionId,
    },
  });
}

async function createOrFindExplanation({
  questionId,
  modelName,
  answerText,
}: {
  questionId: string;
  modelName: string;
  answerText: string;
}) {
  try {
    return await prisma.aiExplanation.create({
      data: {
        questionId,
        modelName,
        answerText,
      },
    });
  } catch (cause) {
    const existing = await prisma.aiExplanation.findUnique({
      where: {
        questionId_modelName: {
          questionId,
          modelName,
        },
      },
    });

    if (existing) return existing;
    throw cause;
  }
}
