import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { makeTitleMemory } from "./helpers/title-memory.mjs";

const factsUrl = new URL("../src/lib/titles/facts.ts", import.meta.url);
const getFacts = async () => {
  assert.ok(existsSync(factsUrl), "the title fact collector must exist");
  return import(factsUrl.href);
};
const now = new Date("2026-10-02T02:00:00Z");
const answered = (code, isCorrect = true, answeredAt = now) => ({ isCorrect, answeredAt, question: { category: { code } } });

test("facts_use_saved_answers_not_profile_totals: three modes include repeats, in-progress and early-ended practice", async () => {
  const { collectTitleFacts } = await getFacts();
  const memory = makeTitleMemory({
    daily: [{ ...answered("technology"), answerDate: new Date("2026-10-02") }],
    random: [{ ...answered("management"), answerDate: new Date("2026-10-02"), answerSequence: 1 }, { ...answered("management"), answerDate: new Date("2026-10-02"), answerSequence: 2 }, { answeredAt: null }],
    practiceAnswers: [answered("strategy"), answered("strategy", false), answered("technology")],
  });
  const facts = await collectTitleFacts(memory.tx, "student", now);
  assert.equal(facts.answerCount, 6);
  assert.deepEqual(facts.categoryCorrect, { technology: 2, management: 2, strategy: 1 });
  assert.equal(facts.randomCorrectMaxRun, 2);
});

test("practice result: completed early is not full; 30-question perfection cannot satisfy 60-question conditions", async () => {
  const { collectTitleFacts } = await getFacts();
  const memory = makeTitleMemory({ sessions: [
    { status: "completed", questionCount: 60, answeredCount: 1, correctCount: 0 },
    { status: "completed", questionCount: 30, answeredCount: 30, correctCount: 30 },
    { status: "in_progress", questionCount: 60, answeredCount: 60, correctCount: 60 },
  ] });
  let facts = await collectTitleFacts(memory.tx, "student", now);
  assert.equal(facts.hasCompletedPractice, true);
  assert.equal(facts.hasPerfect60, false);
  assert.equal(facts.hasZero60, false);
  memory.state.sessions.push({ status: "completed", questionCount: 60, answeredCount: 60, correctCount: 0 });
  facts = await collectTitleFacts(memory.tx, "student", now);
  assert.equal(facts.hasZero60, true);
});

test("deleted_board_rows_count: deleted posts, deleted replies and self replies still count", async () => {
  const { collectTitleFacts } = await getFacts();
  const memory = makeTitleMemory({ posts: [{ deletedAt: now }, { deletedAt: null }], comments: [{ deletedAt: now, authorId: "student" }] });
  const facts = await collectTitleFacts(memory.tx, "student", now);
  assert.equal(facts.boardPostCount, 2);
  assert.equal(facts.boardCommentCount, 1);
});

test("unobserved_is_not_absence: historic last login and answer gaps never prove no-answer use or return gap", async () => {
  const { collectTitleFacts } = await getFacts();
  const memory = makeTitleMemory({ user: { lastLoginAt: new Date("2020-01-01") }, daily: [{ ...answered("technology"), answerDate: new Date("2020-01-01") }] });
  const facts = await collectTitleFacts(memory.tx, "student", now);
  assert.equal(facts.noAnswerActivityMaxRun, 0);
  assert.equal(facts.returnGapMaxDays, 0);
  assert.equal(facts.hasAnswerRunThenBreak, false);
});

test("answer_days_prove_use: historical saved answers can prove 365 days without usage tracker history", async () => {
  const { collectTitleFacts } = await getFacts();
  const daily = Array.from({ length: 365 }, (_, i) => ({ ...answered("technology"), answerDate: new Date(Date.UTC(2025, 0, 1 + i)) }));
  const facts = await collectTitleFacts(makeTitleMemory({ daily }).tx, "student", now);
  assert.equal(facts.activityMaxRun, 365);
  assert.equal(facts.dailyAnswerMaxRun, 365);
  assert.equal(facts.returnGapMaxDays, 0);
});

test("closed_no_answer_days: the partial tracking start and current day are excluded", async () => {
  const { collectTitleFacts } = await getFacts();
  const memory = makeTitleMemory({ profile: { titleTrackingStartedAt: new Date("2026-09-27T03:00:00Z") }, activities: Array.from({ length: 6 }, (_, i) => ({ activityDate: new Date(Date.UTC(2026, 8, 27 + i)), hasAnswered: false })) });
  assert.equal((await collectTitleFacts(memory.tx, "student", now)).noAnswerActivityMaxRun, 4);
  assert.equal((await collectTitleFacts(memory.tx, "student", new Date("2026-10-02T15:00:00Z"))).noAnswerActivityMaxRun, 5);
  memory.state.practiceAnswers.push(answered("strategy", true, new Date("2026-09-30T14:59:00Z")));
  assert.equal((await collectTitleFacts(memory.tx, "student", new Date("2026-10-02T15:00:00Z"))).noAnswerActivityMaxRun, 2);
});

test("three_day_break: proven three learning days followed by an observed absent day qualify only on return", async () => {
  const { collectTitleFacts } = await getFacts();
  const memory = makeTitleMemory({ profile: { titleTrackingStartedAt: new Date("2026-09-28T03:00:00Z") }, activities: [28, 29, 30].map((day) => ({ activityDate: new Date(Date.UTC(2026, 8, day)), hasAnswered: true })) });
  assert.equal((await collectTitleFacts(memory.tx, "student", now)).hasAnswerRunThenBreak, true);
  assert.equal((await collectTitleFacts(memory.tx, "student", new Date("2026-10-01T02:00:00Z"))).hasAnswerRunThenBreak, false);
  memory.state.activities.shift();
  assert.equal((await collectTitleFacts(memory.tx, "student", now)).hasAnswerRunThenBreak, false);
});

test("return gap: 13/14 JST dates, not hours or a fabricated historic login", async () => {
  const { collectTitleFacts } = await getFacts();
  const memory = makeTitleMemory({ profile: { titleTrackingStartedAt: new Date("2026-09-01T00:00:00Z") }, activities: [{ activityDate: new Date("2026-09-18"), hasAnswered: true }] });
  assert.equal((await collectTitleFacts(memory.tx, "student", new Date("2026-10-01T02:00:00Z"))).returnGapMaxDays, 13);
  assert.equal((await collectTitleFacts(memory.tx, "student", now)).returnGapMaxDays, 14);
});

test("ownership counts legacy and starter but excludes the collector and unpurchased eligibility", async () => {
  const { collectTitleFacts } = await getFacts();
  const memory = makeTitleMemory({ owned: ["v1-014", "legacy", "v1-022"], unlocks: [{ titleId: "v1-008" }] });
  const facts = await collectTitleFacts(memory.tx, "student", now);
  assert.equal(facts.ownedCountExcludingCollector, 2);
  assert.deepEqual(facts.ownedKeys, ["v1-014", "v1-022"]);
  assert.equal(facts.nameChanged, false);
});
