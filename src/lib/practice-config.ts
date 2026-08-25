export const ALL_PRACTICE_CATEGORY_CODE = "all" as const;

export const CATEGORIZED_PRACTICE_EXAM_CODE = "fe" as const;

export const PRACTICE_CATEGORIES = [
  { code: "technology", label: "テクノロジ" },
  { code: "management", label: "マネジメント" },
  { code: "strategy", label: "ストラテジ" },
] as const;

export const PRACTICE_QUESTION_COUNTS = [30, 60] as const;

export type PracticeCategoryCode =
  | typeof ALL_PRACTICE_CATEGORY_CODE
  | (typeof PRACTICE_CATEGORIES)[number]["code"];

export type PracticeQuestionCount = (typeof PRACTICE_QUESTION_COUNTS)[number];

export function isPracticeCategoryCode(value: unknown): value is PracticeCategoryCode {
  return (
    value === ALL_PRACTICE_CATEGORY_CODE ||
    PRACTICE_CATEGORIES.some((category) => category.code === value)
  );
}

export function isPracticeQuestionCount(value: unknown): value is PracticeQuestionCount {
  return PRACTICE_QUESTION_COUNTS.some((count) => count === value);
}

export function supportsPracticeCategorySelection(examCode: string) {
  return examCode === CATEGORIZED_PRACTICE_EXAM_CODE;
}
