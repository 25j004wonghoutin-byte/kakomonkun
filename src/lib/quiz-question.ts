import { Prisma } from "../../prisma/generated/client";
import { getQuestionPresentation } from "@/lib/official-question";
import { prisma } from "@/lib/prisma";

const availableQuestionWhere = {
  status: "published",
  deletedAt: null,
} satisfies Prisma.QuestionWhereInput;

export const quizQuestionSelect = {
  id: true,
  questionText: true,
  imagePath: true,
  explanation: true,
  sourceYear: true,
  sourceSeason: true,
  questionNo: true,
  exam: { select: { code: true, name: true } },
  category: { select: { code: true, name: true } },
  choices: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      choiceLabel: true,
      choiceText: true,
      isCorrect: true,
    },
  },
} satisfies Prisma.QuestionSelect;

export type QuizQuestionRecord = Prisma.QuestionGetPayload<{
  select: typeof quizQuestionSelect;
}>;

export async function findDailyQuizQuestion(dateString: string) {
  const questionCount = await prisma.question.count({
    where: availableQuestionWhere,
  });
  if (questionCount < 1) return null;

  const dayNumber = Math.floor(
    Date.parse(`${dateString}T00:00:00.000Z`) / 86_400_000,
  );
  const dailyIndex = ((dayNumber % questionCount) + questionCount) % questionCount;

  const [question] = await prisma.question.findMany({
    where: availableQuestionWhere,
    orderBy: { sourceKey: "asc" },
    skip: dailyIndex,
    take: 1,
    select: quizQuestionSelect,
  });

  return question ?? null;
}

export async function findRandomQuizQuestion() {
  const questionCount = await prisma.question.count({
    where: availableQuestionWhere,
  });
  if (questionCount < 1) return null;

  const [question] = await prisma.question.findMany({
    where: availableQuestionWhere,
    orderBy: { sourceKey: "asc" },
    skip: Math.floor(Math.random() * questionCount),
    take: 1,
    select: quizQuestionSelect,
  });

  return question ?? null;
}

export function toPublicQuizQuestion(question: QuizQuestionRecord) {
  return {
    id: question.id,
    text: question.questionText,
    imagePath: question.imagePath,
    exam: question.exam,
    category: question.category,
    ...getQuestionPresentation(question),
    choices: question.choices.map((choice) => ({
      id: choice.id,
      label: choice.choiceLabel,
      text: choice.choiceText,
    })),
  };
}

export function evaluateQuizQuestion(
  question: QuizQuestionRecord,
  selectedChoiceId: string,
) {
  const selectedChoice = question.choices.find(
    (choice) => choice.id === selectedChoiceId,
  );
  if (!selectedChoice) return { status: "invalid-choice" } as const;

  const correctChoice = question.choices.find((choice) => choice.isCorrect);
  if (!correctChoice) return { status: "missing-correct-choice" } as const;

  return {
    status: "ok",
    selectedChoice,
    answer: {
      selectedChoiceId,
      isCorrect: selectedChoice.isCorrect,
      explanation: question.explanation,
      correctChoice: {
        id: correctChoice.id,
        label: correctChoice.choiceLabel,
        text: correctChoice.choiceText,
      },
    },
  } as const;
}
