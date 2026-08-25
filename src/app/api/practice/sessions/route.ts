import { getCurrentUser } from "@/lib/auth";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import {
  ALL_PRACTICE_CATEGORY_CODE,
  isPracticeCategoryCode,
  isPracticeQuestionCount,
  PRACTICE_CATEGORIES,
  supportsPracticeCategorySelection,
} from "@/lib/practice-config";
import { prisma } from "@/lib/prisma";

type CreateSessionBody = {
  examCode?: string;
  categoryCode?: string;
  questionCount?: number;
};

type CandidateQuestion = {
  id: string;
  category: {
    code: string;
    name: string;
  };
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!["student", "teacher"].includes(user.role.name)) return forbidden();

  const sessions = await prisma.practiceSession.findMany({
    where: {
      userId: user.id,
      status: "in_progress",
    },
    orderBy: { updatedAt: "desc" },
    take: 6,
    select: {
      id: true,
      questionCount: true,
      answeredCount: true,
      startedAt: true,
      exam: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  return Response.json({ sessions });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!["student", "teacher"].includes(user.role.name)) return forbidden();

  let body: CreateSessionBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const examCode = body.examCode?.trim();
  const questionCount = body.questionCount ?? 30;

  if (!examCode) return badRequest("examCode is required");
  if (!isPracticeQuestionCount(questionCount)) {
    return badRequest("questionCount must be 30 or 60");
  }

  const exam = await prisma.exam.findUnique({ where: { code: examCode } });
  if (!exam || !exam.isActive) return badRequest("Unknown or inactive exam");

  const categorySelectionEnabled = supportsPracticeCategorySelection(exam.code);
  const categoryCode = categorySelectionEnabled
    ? (body.categoryCode ?? ALL_PRACTICE_CATEGORY_CODE)
    : ALL_PRACTICE_CATEGORY_CODE;
  if (categorySelectionEnabled && !isPracticeCategoryCode(categoryCode)) {
    return badRequest("categoryCode must be all, technology, management, or strategy");
  }

  const candidates = await prisma.question.findMany({
    where: {
      examId: exam.id,
      status: "published",
      deletedAt: null,
      category: categorySelectionEnabled
        ? categoryCode === ALL_PRACTICE_CATEGORY_CODE
          ? { code: { in: PRACTICE_CATEGORIES.map((category) => category.code) } }
          : { code: categoryCode }
        : undefined,
    },
    select: {
      id: true,
      category: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  const selectedCandidates = categorySelectionEnabled
    ? selectCandidates(candidates, categoryCode, questionCount)
    : selectAnyCandidates(candidates, questionCount, exam.name);
  if ("shortages" in selectedCandidates) {
    return badRequest("条件に合う問題数が不足しています。", {
      shortages: selectedCandidates.shortages,
    });
  }

  const selected = shuffle(selectedCandidates.questions).map((question, index) => ({
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
      categoryCode: categorySelectionEnabled ? categoryCode : null,
      questionCount: session.questionCount,
      status: session.status,
    },
    { status: 201 },
  );
}

function selectAnyCandidates(
  candidates: CandidateQuestion[],
  questionCount: number,
  examName: string,
):
  | { questions: CandidateQuestion[] }
  | {
      shortages: Array<{
        categoryCode: string;
        categoryName: string;
        available: number;
        required: number;
      }>;
    } {
  if (candidates.length < questionCount) {
    return {
      shortages: [
        {
          categoryCode: ALL_PRACTICE_CATEGORY_CODE,
          categoryName: examName,
          available: candidates.length,
          required: questionCount,
        },
      ],
    };
  }

  return { questions: shuffle(candidates).slice(0, questionCount) };
}

function selectCandidates(
  candidates: CandidateQuestion[],
  categoryCode: string,
  questionCount: number,
):
  | { questions: CandidateQuestion[] }
  | {
      shortages: Array<{
        categoryCode: string;
        categoryName: string;
        available: number;
        required: number;
      }>;
    } {
  if (categoryCode !== ALL_PRACTICE_CATEGORY_CODE) {
    if (candidates.length < questionCount) {
      const categoryName = candidates[0]?.category.name ?? categoryCode;
      return {
        shortages: [
          {
            categoryCode,
            categoryName,
            available: candidates.length,
            required: questionCount,
          },
        ],
      };
    }

    return { questions: shuffle(candidates).slice(0, questionCount) };
  }

  const questionsPerCategory = questionCount / PRACTICE_CATEGORIES.length;
  const grouped = new Map<string, CandidateQuestion[]>();
  for (const candidate of candidates) {
    const categoryQuestions = grouped.get(candidate.category.code) ?? [];
    categoryQuestions.push(candidate);
    grouped.set(candidate.category.code, categoryQuestions);
  }

  const shortages = PRACTICE_CATEGORIES.flatMap((category) => {
    const categoryQuestions = grouped.get(category.code) ?? [];
    return categoryQuestions.length < questionsPerCategory
      ? [
          {
            categoryCode: category.code,
            categoryName: categoryQuestions[0]?.category.name ?? category.label,
            available: categoryQuestions.length,
            required: questionsPerCategory,
          },
        ]
      : [];
  });

  if (shortages.length > 0) return { shortages };

  return {
    questions: PRACTICE_CATEGORIES.flatMap((category) =>
      shuffle(grouped.get(category.code) ?? []).slice(0, questionsPerCategory),
    ),
  };
}

function shuffle<T>(items: readonly T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}
