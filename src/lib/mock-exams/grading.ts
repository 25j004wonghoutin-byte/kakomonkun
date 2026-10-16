import { MockError } from "./contract";

/** 表示用の100点換算。順位比較には丸め前の正解数を使用する。 */
export function scorePercent(correct: number, total: number): number {
  if (!Number.isSafeInteger(correct) || !Number.isSafeInteger(total)
    || correct < 0 || total <= 0 || correct > total) {
    throw new MockError("invalid_score_counts", 400, "採点対象の回答数が正しくありません。");
  }
  return correct === 0 ? 0 : Math.round((correct / total) * 10_000) / 100;
}
