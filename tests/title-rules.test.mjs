import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { TITLE_CATALOG, COMPLETE_COLLECTION_V1_KEYS } from "../src/lib/titles/catalog.ts";
import { makeTitleFacts } from "./fixtures/title-facts.mjs";

const rulesUrl = new URL("../src/lib/titles/rules.ts", import.meta.url);
const getRules = async () => {
  assert.ok(existsSync(rulesUrl), "pure title rules must exist");
  return import(rulesUrl.href);
};
const perfect = (count) => ({ questionCount: count, answeredCount: count, correctCount: count });

test("perfect_practice_threshold: mixed 30/60 practice needs three fully answered perfect results", async () => {
  const { maxPerfectPracticeRun } = await getRules();
  assert.equal(maxPerfectPracticeRun([]), 0);
  assert.equal(maxPerfectPracticeRun([perfect(30), perfect(60)]), 2);
  assert.equal(maxPerfectPracticeRun([perfect(30), perfect(60), perfect(30)]), 3);
  for (const interrupted of [
    { questionCount: 60, answeredCount: 59, correctCount: 59 },
    { questionCount: 30, answeredCount: 30, correctCount: 29 },
    { questionCount: 0, answeredCount: 0, correctCount: 0 },
  ]) assert.equal(maxPerfectPracticeRun([perfect(30), perfect(60), interrupted, perfect(30)]), 2);
});

test("historical_max_is_permanent_candidate: later failure never erases a completed record", async () => {
  const { maxPerfectPracticeRun, maxDateRun, evaluateTitleRules } = await getRules();
  const maximum = maxPerfectPracticeRun([perfect(30), perfect(60), perfect(30), { questionCount: 30, answeredCount: 1, correctCount: 0 }]);
  assert.equal(maximum, 3);
  const dates = Array.from({ length: 100 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  assert.equal(maxDateRun([...dates, "2026-08-01"]), 100);
  const unlocked = evaluateTitleRules(makeTitleFacts({ perfectPracticeMaxRun: maximum, dailyAnswerMaxRun: maxDateRun(dates), dailyIncorrectMaxRun: 5 }), TITLE_CATALOG);
  for (const key of ["v1-048", "v1-007", "v1-015", "v1-038"]) assert.ok(unlocked.includes(key));
});

test("date runs deduplicate usage and handle leap days and JST calendar year boundaries", async () => {
  const { maxDateRun } = await getRules();
  assert.equal(maxDateRun([]), 0);
  assert.equal(maxDateRun(["2024-03-01", "2024-02-29", "2024-02-28", "2024-02-29"]), 3);
  assert.equal(maxDateRun(["2025-12-31", "2026-01-01", "2026-01-03"]), 2);
});

const numericBoundaries = [
  ["v1-010", "answerCount", 1000],
  ["v1-007", "dailyAnswerMaxRun", 30],
  ["v1-015", "dailyAnswerMaxRun", 100],
  ["v1-038", "dailyIncorrectMaxRun", 5],
  ["v1-048", "perfectPracticeMaxRun", 3],
  ["v1-002", "randomCorrectMaxRun", 50],
  ["v1-003", "randomCorrectMaxRun", 100],
  ["v1-021", "randomCorrectMaxRun", 150],
  ["v1-039", "randomCorrectMaxRun", 200],
  ["v1-066", "activityMaxRun", 365],
  ["v1-017", "noAnswerActivityMaxRun", 5],
  ["v1-036", "returnGapMaxDays", 14],
  ["v1-037", "navigationRoundTrips", 5],
  ["v1-022", "ownedCountExcludingCollector", 20],
  ["v1-023", "boardPostCount", 10],
  ["v1-024", "boardCommentCount", 10],
];
for (const [key, field, threshold] of numericBoundaries) {
  test(`${key}: ${field} requires ${threshold}, not ${threshold - 1}`, async () => {
    const { evaluateTitleRules } = await getRules();
    assert.ok(!evaluateTitleRules(makeTitleFacts({ [field]: threshold - 1 }), TITLE_CATALOG).includes(key));
    assert.ok(evaluateTitleRules(makeTitleFacts({ [field]: threshold }), TITLE_CATALOG).includes(key));
  });
}

for (const [category, key] of [["technology", "v1-004"], ["management", "v1-005"], ["strategy", "v1-006"]]) {
  test(`${category}: 300 correct answers, not 299, regardless of repeated questions`, async () => {
    const { evaluateTitleRules } = await getRules();
    assert.ok(!evaluateTitleRules(makeTitleFacts({ categoryCorrect: { [category]: 299 } }), TITLE_CATALOG).includes(key));
    const keys = evaluateTitleRules(makeTitleFacts({ categoryCorrect: { [category]: 300 } }), TITLE_CATALOG);
    assert.deepEqual(keys, [key]);
  });
}

for (const threshold of [50, 100, 150, 200]) {
  test(`random streak ${threshold}: wrong answer or changed JST day interrupts only the current run`, async () => {
    const { maxRandomCorrectRun } = await getRules();
    const answers = Array.from({ length: threshold }, () => ({ answerDate: "2026-10-01", isCorrect: true }));
    assert.equal(maxRandomCorrectRun(answers.slice(1)), threshold - 1);
    assert.equal(maxRandomCorrectRun(answers), threshold);
    assert.equal(maxRandomCorrectRun([...answers, { answerDate: "2026-10-01", isCorrect: false }]), threshold);
    assert.equal(maxRandomCorrectRun([...answers.slice(1), { answerDate: "2026-10-02", isCorrect: true }]), threshold - 1);
    assert.equal(maxRandomCorrectRun([...answers.slice(1), { answerDate: "2026-10-01", isCorrect: false }, answers[0]]), threshold - 1);
  });
}

test("ownership requires the actual fixed 58 keys, not an equal quantity of unrelated or unlocked titles", async () => {
  const { evaluateTitleRules } = await getRules();
  const required = [...COMPLETE_COLLECTION_V1_KEYS];
  assert.ok(!evaluateTitleRules(makeTitleFacts({ ownedKeys: [...required.slice(1), "v1-009", "legacy", "future", required[1]] }), TITLE_CATALOG).includes("v1-001"));
  assert.ok(evaluateTitleRules(makeTitleFacts({ ownedKeys: required }), TITLE_CATALOG).includes("v1-001"));
  assert.ok(!evaluateTitleRules(makeTitleFacts({ unlockedKeys: required }), TITLE_CATALOG).includes("v1-001"));
});

for (const [key, field] of [["v1-008", "hasCompletedPractice"], ["v1-016", "hasZero60"], ["v1-035", "hasPerfect60"], ["v1-020", "hasAnswerRunThenBreak"], ["v1-050", "nameChanged"]]) {
  test(`${key}: requires the proven ${field} fact, not a fabricated inference`, async () => {
    const { evaluateTitleRules } = await getRules();
    assert.ok(!evaluateTitleRules(makeTitleFacts(), TITLE_CATALOG).includes(key));
    assert.ok(evaluateTitleRules(makeTitleFacts({ [field]: true }), TITLE_CATALOG).includes(key));
  });
}

test("ranking, paid and starter are never conditional unlock candidates", async () => {
  const { evaluateTitleRules } = await getRules();
  const keys = evaluateTitleRules(makeTitleFacts({ monthlyRank: 1, monthlyRankCount: 100, monthlyTopMaxRun: 100 }), TITLE_CATALOG);
  assert.deepEqual(keys, []);
  const disabled = TITLE_CATALOG.map((definition) => ({ ...definition, implemented: false }));
  assert.deepEqual(evaluateTitleRules(makeTitleFacts({ answerCount: 100000 }), disabled), []);
});

test("evaluation does not mutate facts, definitions or the fixed collection", async () => {
  const { evaluateTitleRules } = await getRules();
  const facts = makeTitleFacts({ ownedKeys: [...COMPLETE_COLLECTION_V1_KEYS] });
  const previous = structuredClone(facts);
  evaluateTitleRules(facts, TITLE_CATALOG);
  assert.deepEqual(facts, previous);
});
