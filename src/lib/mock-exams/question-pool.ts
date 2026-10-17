import type { Prisma } from "../../../prisma/generated/client";
import { MockError } from "./contract";

export const mockPoolSelect = {
  id: true, sourceKey: true, sourceYear: true, sourceSeason: true, questionNo: true,
  questionText: true, imagePath: true, explanation: true, questionType: true,
  status: true, deletedAt: true,
  exam: { select: { code: true } }, category: { select: { code: true } },
  choices: { orderBy: { sortOrder: "asc" }, select: {
    id: true, choiceLabel: true, choiceText: true, isCorrect: true, sortOrder: true,
  } },
} satisfies Prisma.QuestionSelect;

export type PoolQuestion = Prisma.QuestionGetPayload<{ select: typeof mockPoolSelect }>;

export function isEligibleMockQuestion(q: PoolQuestion, assets: ReadonlySet<string>): boolean {
  if (q.exam.code !== "fe" && q.exam.code !== "it_passport") return false;
  if (q.status !== "published" || q.deletedAt !== null || q.questionType !== "single_choice") return false;
  if (!Number.isInteger(q.sourceYear)) return false;
  const year=String(q.sourceYear);
  if (!/^[1-9][0-9]{3}$/.test(year)
    && !(q.exam.code === "fe" && /^[1-9][0-9]{3}(?:0[1-9]|1[0-2])$/.test(year))) return false;
  if (!q.questionText.trim() || !q.sourceKey.trim()
    || !["technology","management","strategy"].includes(q.category.code)) return false;
  if (q.imagePath !== null && (!q.imagePath.startsWith("/kakomon/") || /[?#\\\u0000-\u001f]/.test(q.imagePath)
    || q.imagePath.split("/").some(part=>part===".."||part===".") || !assets.has(q.imagePath))) return false;
  if (q.imagePath === null && /問題画像|画像参照/.test(q.questionText+q.choices.map(c=>c.choiceText).join(""))) return false;
  return q.choices.length === 4 && q.choices.filter(c=>c.isCorrect).length === 1
    && new Set(q.choices.map(c=>c.id)).size === 4
    && new Set(q.choices.map(c=>c.choiceLabel)).size === 4
    && new Set(q.choices.map(c=>c.sortOrder)).size === 4
    && q.choices.every(c=>c.choiceLabel.trim() && c.choiceText.trim() && Number.isInteger(c.sortOrder) && c.sortOrder>=1 && c.sortOrder<=4);
}

export function selectMockQuestions<T extends { id: string }>(
  candidates: readonly T[], count: number, randomInt: (max: number)=>number,
): T[] {
  if (!Number.isSafeInteger(count) || count<1) throw new MockError("invalid_question_count",400,"問題数が正しくありません。");
  if (new Set(candidates.map(q=>q.id)).size !== candidates.length) throw new MockError("invalid_question_pool",503,"出題候補が重複しています。");
  if (candidates.length<count) throw new MockError("insufficient_questions",503,"有効な問題が不足しているため模擬試験を準備できません。");
  const shuffled=[...candidates];
  for(let i=shuffled.length-1;i>0;i--){
    const j=randomInt(i+1);
    if(!Number.isInteger(j)||j<0||j>i)throw new MockError("invalid_random",503,"問題の抽選に失敗しました。");
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  return shuffled.slice(0,count);
}
