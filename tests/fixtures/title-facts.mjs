export function makeTitleFacts(overrides = {}) {
  return {
    answerCount: 0,
    dailyAnswerMaxRun: 0,
    dailyIncorrectMaxRun: 0,
    hasCompletedPractice: false,
    hasPerfect60: false,
    hasZero60: false,
    perfectPracticeMaxRun: 0,
    randomCorrectMaxRun: 0,
    activityMaxRun: 0,
    noAnswerActivityMaxRun: 0,
    hasAnswerRunThenBreak: false,
    returnGapMaxDays: 0,
    navigationRoundTrips: 0,
    boardPostCount: 0,
    boardCommentCount: 0,
    ownedCountExcludingCollector: 0,
    ownedKeys: [],
    nameChanged: false,
    ...overrides,
    categoryCorrect: { technology: 0, management: 0, strategy: 0, ...overrides.categoryCorrect },
  };
}
