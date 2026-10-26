import { makeLearningMemory } from "./learning-memory.mjs";
export const reviewNow = new Date("2026-10-26T01:00:00Z");
export const reviewActor = { id: "student", roleName: "student", status: "active", deletedAt: null };
export const reviewItemId = "11111111-1111-4111-8111-111111111111";
export const reviewQuestion = () => ({ id: "q", updatedAt: reviewNow, status: "published", deletedAt: null, questionText: "復習する問題", imagePath: null, sourceYear: 2024, sourceSeason: "公開問題", questionNo: 1, explanation: "検証用の解説", exam: { code: "it_passport", name: "ITパスポート" }, category: { code: "technology", name: "テクノロジ" }, choices: [
  { id: "correct", questionId: "q", choiceLabel: "ア", choiceText: "正解", isCorrect: true, sortOrder: 1, updatedAt: reviewNow },
  { id: "wrong", questionId: "q", choiceLabel: "イ", choiceText: "誤り", isCorrect: false, sortOrder: 2, updatedAt: reviewNow },
] });
export const reviewItem = (overrides = {}) => ({ id: reviewItemId, userId: "student", questionId: "q", status: "unreviewed", revision: 1, firstWrongAt: reviewNow, lastWrongAt: reviewNow, lastReviewedAt: null, createdAt: reviewNow, updatedAt: reviewNow, ...overrides });
export function makeReviewMemory(overrides = {}) {
  return makeLearningMemory({ questions: [reviewQuestion()], reviewItems: [reviewItem()], reviewAnswers: [], ...overrides });
}
export const rewardState = state => {
  const { reviewItems, reviewAnswers, locks, ...other } = structuredClone(state);
  return other;
};
