import assert from "node:assert/strict";
import test from "node:test";
import { makeLearningMemory } from "./helpers/learning-memory.mjs";
import { issueRandomAttempt, saveRandomAnswer } from "../src/lib/titles/random-attempts.ts";
import { collectTitleFacts } from "../src/lib/titles/facts.ts";
const now = new Date("2026-10-02T10:00:00Z");
test("200 separately issued repeated questions save ordered answers and four permanent thresholds", async () => {
  const db = makeLearningMemory();
  for (let i = 1; i <= 200; i++) {
    await db.prisma.$transaction(async (tx) => {
      const { attemptId } = await issueRandomAttempt(tx, "student", "q", now);
      await saveRandomAnswer(tx, "student", { attemptId, selectedChoiceId: "correct" }, now);
    });
    if (i === 49) assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-002"), false);
    if (i === 50) assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-002"), true);
    if (i === 199) assert.equal(db.state.unlocks.some((row) => row.titleId === "v1-039"), false);
  }
  assert.equal(db.state.random.length, 200); assert.equal(db.state.random.at(-1).answerSequence, 200);
  assert.deepEqual(db.state.unlocks.map((row) => row.titleId).sort(), ["v1-002", "v1-003", "v1-021", "v1-039"]);
  assert.equal(db.state.notifications.length, 4); assert.equal(db.state.owned.length, 0); assert.equal(db.state.profile.totalPoints, 0);
  await db.prisma.$transaction((tx) => saveRandomAnswer(tx, "student", { attemptId: db.state.random.at(-1).id, selectedChoiceId: "wrong" }, new Date("2026-10-03T10:00:00Z")));
  assert.equal(db.state.notifications.length, 4); assert.equal((await collectTitleFacts(db.tx, "student", now)).randomCorrectMaxRun, 200);
});
