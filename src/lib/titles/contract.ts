export type TitleCategory = "technology" | "management" | "strategy";

export type TitleCondition =
  | { readonly type: "answer_count"; readonly count: number }
  | { readonly type: "category_correct"; readonly category: TitleCategory; readonly count: number }
  | { readonly type: "daily_answer_run" | "daily_incorrect_run"; readonly count: number }
  | { readonly type: "practice_first_complete" }
  | { readonly type: "practice_result"; readonly questionCount: 60; readonly result: "perfect" | "zero" }
  | { readonly type: "practice_perfect_run" | "random_correct_run"; readonly count: number }
  | { readonly type: "activity_run" | "no_answer_activity_run"; readonly count: number }
  | { readonly type: "answer_run_then_break"; readonly count: number; readonly breakDays: number }
  | { readonly type: "return_gap"; readonly days: number }
  | { readonly type: "navigation_round_trips"; readonly count: number }
  | { readonly type: "owned_count"; readonly count: number; readonly excludeKey: string }
  | { readonly type: "owned_set"; readonly keys: readonly string[] }
  | { readonly type: "name_changed" }
  | { readonly type: "monthly_rank"; readonly rank: number }
  | { readonly type: "monthly_rank_count" | "monthly_top_run"; readonly rank: number; readonly count: number }
  | { readonly type: "board_post_count" | "board_comment_count"; readonly count: number };

export type TitleDefinition = {
  readonly key: string;
  readonly name: string;
  readonly pricePoints: number;
  readonly acquisitionKind: "starter" | "points" | "condition";
  readonly condition: TitleCondition | null;
  readonly implemented: boolean;
};

export type TitleFacts = {
  answerCount: number;
  categoryCorrect: Record<TitleCategory, number>;
  dailyAnswerMaxRun: number;
  dailyIncorrectMaxRun: number;
  hasCompletedPractice: boolean;
  hasPerfect60: boolean;
  hasZero60: boolean;
  perfectPracticeMaxRun: number;
  randomCorrectMaxRun: number;
  activityMaxRun: number;
  noAnswerActivityMaxRun: number;
  hasAnswerRunThenBreak: boolean;
  returnGapMaxDays: number;
  navigationRoundTrips: number;
  boardPostCount: number;
  boardCommentCount: number;
  ownedCountExcludingCollector: number;
  ownedKeys: string[];
  nameChanged: boolean;
};

export type UnlockContext = {
  now: Date;
  displayNameChanged?: boolean;
  source: "backfill" | "event";
};

export type UnlockSummary = { newlyUnlockedKeys: string[] };

export type TitleShopItem = {
  id: string;
  key: string;
  name: string;
  pricePoints: number;
  conditionText: string | null;
  owned: boolean;
  state: "starter" | "owned" | "locked" | "available" | "insufficient";
  implemented: boolean;
};

export type ActivityInput = {
  now: Date;
  hasAnswered?: boolean;
  navigation?: { tabId: string; sequence: number; path: string };
};
