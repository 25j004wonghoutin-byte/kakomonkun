import type { TitleCondition, TitleDefinition, TitleFacts } from "./contract";

const DAY_MS = 86_400_000;

/** JSTの日付文字列を日単位で比較する。入力順と重複に依存しない。 */
export function maxDateRun(dates: readonly string[]): number {
  const days = [...new Set(dates)].sort();
  let previous: number | undefined;
  let current = 0;
  let maximum = 0;
  for (const date of days) {
    const day = Date.parse(`${date}T00:00:00Z`) / DAY_MS;
    current = previous !== undefined && day - previous === 1 ? current + 1 : 1;
    maximum = Math.max(maximum, current);
    previous = day;
  }
  return maximum;
}

/** 終了順の結果だけを渡す。一時離脱・再開待ちは含めない。 */
export function maxPerfectPracticeRun(
  sessions: readonly { questionCount: number; answeredCount: number; correctCount: number }[],
): number {
  let current = 0;
  let maximum = 0;
  for (const session of sessions) {
    const perfect = session.questionCount > 0
      && session.answeredCount === session.questionCount
      && session.correctCount === session.questionCount;
    current = perfect ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

/** サーバー採番の回答順を使用する。日付と不正解で現在の連続数を切る。 */
export function maxRandomCorrectRun(
  answers: readonly { answerDate: string; isCorrect: boolean }[],
): number {
  let previousDate: string | undefined;
  let current = 0;
  let maximum = 0;
  for (const answer of answers) {
    if (answer.answerDate !== previousDate) current = 0;
    current = answer.isCorrect ? current + 1 : 0;
    maximum = Math.max(maximum, current);
    previousDate = answer.answerDate;
  }
  return maximum;
}

function conditionMet(facts: TitleFacts, condition: TitleCondition): boolean {
  switch (condition.type) {
    case "answer_count": return facts.answerCount >= condition.count;
    case "category_correct": return facts.categoryCorrect[condition.category] >= condition.count;
    case "daily_answer_run": return facts.dailyAnswerMaxRun >= condition.count;
    case "daily_incorrect_run": return facts.dailyIncorrectMaxRun >= condition.count;
    case "practice_first_complete": return facts.hasCompletedPractice;
    case "practice_result": return condition.result === "perfect" ? facts.hasPerfect60 : facts.hasZero60;
    case "practice_perfect_run": return facts.perfectPracticeMaxRun >= condition.count;
    case "random_correct_run": return facts.randomCorrectMaxRun >= condition.count;
    case "activity_run": return facts.activityMaxRun >= condition.count;
    case "no_answer_activity_run": return facts.noAnswerActivityMaxRun >= condition.count;
    case "answer_run_then_break": return facts.hasAnswerRunThenBreak;
    case "return_gap": return facts.returnGapMaxDays >= condition.days;
    case "navigation_round_trips": return facts.navigationRoundTrips >= condition.count;
    case "owned_count": return facts.ownedCountExcludingCollector >= condition.count;
    case "owned_set": {
      const owned = new Set(facts.ownedKeys);
      return condition.keys.every((key) => owned.has(key));
    }
    case "name_changed": return facts.nameChanged;
    case "board_post_count": return facts.boardPostCount >= condition.count;
    case "board_comment_count": return facts.boardCommentCount >= condition.count;
    // 月間順位の確定機能ができるまでは、暫定順位から付与しない。
    case "monthly_rank":
    case "monthly_rank_count":
    case "monthly_top_run": return false;
  }
}

/** 今回達成を証明できる候補。永久資格の保存・既所有の除外は永続化層で行う。 */
export function evaluateTitleRules(
  facts: TitleFacts,
  definitions: readonly TitleDefinition[],
): string[] {
  return definitions
    .filter((definition) => definition.implemented
      && definition.acquisitionKind === "condition"
      && definition.condition !== null
      && conditionMet(facts, definition.condition))
    .map((definition) => definition.key);
}
