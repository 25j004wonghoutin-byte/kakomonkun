import type { Prisma } from "../../../prisma/generated/client";
import type { RankingTitleFacts } from "../titles/contract";

export function emptyRankingTitleFacts(): RankingTitleFacts {
  return {
    it_passport: { rankCounts: { 1: 0, 2: 0, 3: 0 }, topThreeMaxRun: 0 },
    fe: { rankCounts: { 1: 0, 2: 0, 3: 0 }, topThreeMaxRun: 0 },
  };
}

/** 確定済みの新形式順位だけを使い、試験別の完全一致回数と過去最大の暦月連続を集計する。 */
export async function collectRankingTitleFacts(tx: Prisma.TransactionClient, userId: string): Promise<RankingTitleFacts> {
  const facts = emptyRankingTitleFacts();
  const rows = await tx.monthlyRanking.findMany({
    where: { userId, isFinal: true, mockExam: { rankingFinalizedAt: { not: null }, exam: { code: { in: ["it_passport", "fe"] } } } },
    select: { rankNo: true, targetMonth: true, mockExam: { select: { exam: { select: { code: true } } } } },
  });
  const topMonths = { it_passport: new Set<number>(), fe: new Set<number>() };
  for (const row of rows) {
    const code = row.mockExam.exam.code;
    if (code !== "it_passport" && code !== "fe") continue;
    if (row.rankNo === 1 || row.rankNo === 2 || row.rankNo === 3) {
      facts[code].rankCounts[row.rankNo]++;
      // 月はDBのdate列。UTCの年・月だけで比較し、12月→1月も差1として扱う。
      topMonths[code].add(row.targetMonth.getUTCFullYear() * 12 + row.targetMonth.getUTCMonth());
    }
  }
  for (const code of ["it_passport", "fe"] as const) {
    let previous: number | undefined;
    let run = 0;
    for (const month of [...topMonths[code]].sort((a, b) => a - b)) {
      run = previous !== undefined && month === previous + 1 ? run + 1 : 1;
      facts[code].topThreeMaxRun = Math.max(facts[code].topThreeMaxRun, run);
      previous = month;
    }
  }
  return facts;
}
