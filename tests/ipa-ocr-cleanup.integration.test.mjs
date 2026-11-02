import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "../prisma/generated/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadTestConfig } from "../scripts/test-environment.mjs";
import { removeIpaOcr } from "../scripts/remove-ipa-ocr.mjs";
import { prepareMockExam } from "../src/lib/mock-exams/prepare.ts";

test("concurrent preparation cannot leave copied OCR after cleanup", {
  skip: process.env.RUN_IPA_OCR_DB_TESTS !== "1", timeout: 90000,
}, async () => {
  const config = loadTestConfig();
  const makeDb = () => new PrismaClient({ adapter: new PrismaPg({
    connectionString: config.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000, allowExitOnIdle: true, statement_timeout: 20000,
  }) });
  const db = makeDb(), other = makeDb(), ownedIds = new Set();
  const month = "2044-11", targetMonth = new Date("2044-11-01");
  let release, reached, preparation, calls = 0, cleanupConflicted = false;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { reached = resolve; });
  let modified = false;
  try {
    const exam = await db.exam.findUniqueOrThrow({ where: { code: "it_passport" } });
    assert.equal(await db.mockExam.count({ where: { examId: exam.id, targetMonth } }), 0, "Probe refuses an existing exam/month");
    const updated = await db.question.updateMany({
      where: { sourceKey: { startsWith: "ipa-it-passport-" } },
      data: { questionText: "UNWANTED_OCR_CONCURRENCY_PROBE" },
    });
    modified = true;
    assert.equal(updated.count, 600);
    preparation = prepareMockExam(other, { examCode: "it_passport", month }, async tx => {
      calls++;
      const draft = await tx.mockExam.findUniqueOrThrow({ where: { examId_targetMonth: { examId: exam.id, targetMonth } } });
      ownedIds.add(draft.id);
      if (calls === 1) { reached(); await gate; }
      return new Date("2044-11-02T00:00:00Z");
    }).then(value => ({ value }), error => ({ error }));
    await Promise.race([ready, preparation.then(result => { if (result.error) throw result.error; })]);
    try {
      await removeIpaOcr(db, { apply: true });
    } catch (error) {
      if (error.code !== "P2034") throw error;
      cleanupConflicted = true;
    } finally {
      release();
    }
    const result = await preparation;
    if (result.error) throw result.error;
    if (cleanupConflicted) await removeIpaOcr(db, { apply: true });
    const frozen = await db.mockExamQuestion.findMany({ where: { mockExamId: result.value.mockExamId } });
    assert.equal(frozen.length, 100);
    assert.equal(frozen.filter(q => q.questionText === "UNWANTED_OCR_CONCURRENCY_PROBE").length, 0, "New frozen snapshots must not retain old OCR");
    assert.ok(cleanupConflicted || calls >= 2, "An incompatible concurrent transaction must abort and retry");
    const second = await removeIpaOcr(db, { apply: true });
    assert.equal(second.mastersUpdated, 0);
    assert.equal(second.snapshotsUpdated, 0);
    console.log(JSON.stringify({ concurrencyProbe: true, prepareCalls: calls, cleanupConflicted, frozen: frozen.length, ocrRemaining: 0, secondPassUpdates: 0 }));
  } finally {
    release();
    if (preparation) await preparation;
    try {
      if (ownedIds.size) {
        const ids = [...ownedIds];
        await db.$transaction(async tx => {
          await tx.mockExamChoice.deleteMany({ where: { mockExamId: { in: ids } } });
          await tx.mockExamQuestion.deleteMany({ where: { mockExamId: { in: ids } } });
          await tx.mockExam.deleteMany({ where: { id: { in: ids } } });
        });
      }
      if (modified) await removeIpaOcr(db, { apply: true });
      assert.equal(await db.mockExam.count({ where: { id: { in: [...ownedIds] } } }), 0);
    } finally {
      await other.$disconnect();
      await db.$disconnect();
    }
  }
});
