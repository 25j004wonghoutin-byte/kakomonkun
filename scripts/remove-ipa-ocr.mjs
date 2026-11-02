import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateOfficialImageRecord } from "./ipa-image-record.mjs";

export function planIpaOcrCleanup(records) {
  const ids = new Set();
  return records.flatMap(record => {
    assert.ok(typeof record.id === "string" && record.id.length > 0, "Missing question identity");
    assert.ok(!ids.has(record.id), "Duplicate question identity");
    ids.add(record.id);
    assert.equal(typeof record.questionText, "string", "Missing question body");
    const text = validateOfficialImageRecord(record);
    return record.questionText === text ? [] : [{ id: record.id, oldText: record.questionText, text }];
  });
}

export function selectIpaSnapshots(snapshots, questions) {
  const byId = new Map(questions.map(q => [q.id, q]));
  return snapshots.filter(snapshot => {
    const master = byId.get(snapshot.questionId);
    if (!master && !isOfficial(snapshot)) return false;
    assert.ok(master, "Frozen IPA question must reference an official master");
    assert.equal(snapshot.sourceKey, master.sourceKey, "Frozen IPA source mismatch");
    return true;
  });
}

const protectedModels = [
  "practiceSession", "practiceSessionQuestion", "practiceAnswer", "dailyQaAnswer",
  "randomQuizAttempt", "mockExam", "mockAttempt", "mockAnswer",
  "reviewNotebookItem", "reviewNotebookAnswer", "studentProfile", "pointTransaction",
  "userTitle", "monthlyRanking", "aiExplanation", "aiUsageLog", "boardPost", "boardComment",
];
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isOfficial = q => q.sourceKey.startsWith("ipa-it-passport-");
const readQuestions = tx => tx.question.findMany({ orderBy: { id: "asc" }, include: { choices: { orderBy: { id: "asc" } } } });
const readSnapshots = tx => tx.mockExamQuestion.findMany({ orderBy: { id: "asc" }, include: { choices: { orderBy: { id: "asc" } } } });
async function protectedState(tx) {
  const state = {};
  const [optional] = await tx.$queryRawUnsafe("SELECT to_regclass('public.ai_explanations')::text AS explanations, to_regclass('public.ai_usage_logs')::text AS usage");
  for (const model of protectedModels) {
    if (model === "aiExplanation" && !optional.explanations || model === "aiUsageLog" && !optional.usage) {
      state[model] = { exists: false };
      continue;
    }
    const rows = await tx[model].findMany();
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    state[model] = { exists: true, count: rows.length, sha256: hash(rows) };
  }
  return state;
}
function preservedFingerprint(questions, snapshots) {
  return hash({
    questions: questions.map(q => {
      if (!isOfficial(q)) return q;
      const preserved = { ...q };
      delete preserved.questionText;
      delete preserved.updatedAt;
      return preserved;
    }),
    snapshots: snapshots.map(q => {
      if (!isOfficial(q)) return q;
      const preserved = { ...q };
      delete preserved.questionText;
      return preserved;
    }),
  });
}
export async function removeIpaOcr(db, { apply = false } = {}) {
  return db.$transaction(async tx => {
    if (!apply) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
    const allQuestions = await readQuestions(tx);
    const allSnapshots = await readSnapshots(tx);
    const questions = allQuestions.filter(isOfficial);
    const snapshots = selectIpaSnapshots(allSnapshots, questions);
    assert.equal(questions.length, 600, "Expected the exact 600 official questions");
    assert.equal(new Set(questions.map(q => q.sourceKey)).size, 600, "Duplicate IPA source key");
    const masterPlan = planIpaOcrCleanup(questions);
    const snapshotPlan = planIpaOcrCleanup(snapshots);
    const preservedBefore = preservedFingerprint(allQuestions, allSnapshots);
    const protectedBefore = await protectedState(tx);
    let mastersUpdated = 0, snapshotsUpdated = 0;
    if (apply && masterPlan.length) {
      const changes = JSON.stringify(masterPlan.map(q => ({ id: q.id, text: q.text, old_text: q.oldText })));
      mastersUpdated = await tx.$executeRaw`
        UPDATE public.questions AS q
        SET question_text = changes.text, updated_at = now()
        FROM jsonb_to_recordset(${changes}::jsonb) AS changes(id uuid, text text, old_text text)
        WHERE q.id = changes.id AND q.question_text = changes.old_text
      `;
      assert.equal(mastersUpdated, masterPlan.length, "Concurrent master change; rollback");
    }
    if (apply && snapshotPlan.length) {
      const changes = JSON.stringify(snapshotPlan.map(q => ({ id: q.id, text: q.text, old_text: q.oldText })));
      snapshotsUpdated = await tx.$executeRaw`
        UPDATE public.mock_exam_questions AS q
        SET question_text = changes.text
        FROM jsonb_to_recordset(${changes}::jsonb) AS changes(id uuid, text text, old_text text)
        WHERE q.id = changes.id AND q.question_text = changes.old_text
      `;
      assert.equal(snapshotsUpdated, snapshotPlan.length, "Concurrent snapshot change; rollback");
    }
    const afterQuestions = await readQuestions(tx);
    const afterSnapshots = await readSnapshots(tx);
    const preservedAfter = preservedFingerprint(afterQuestions, afterSnapshots);
    assert.equal(preservedAfter, preservedBefore, "Image, grading or non-target data changed; rollback");
    const protectedAfter = await protectedState(tx);
    assert.deepEqual(protectedAfter, protectedBefore, "Learning history or rewards changed; rollback");
    const masterRemaining = planIpaOcrCleanup(afterQuestions.filter(isOfficial)).length;
    const snapshotRemaining = planIpaOcrCleanup(selectIpaSnapshots(afterSnapshots, afterQuestions.filter(isOfficial))).length;
    if (apply) {
      assert.equal(masterRemaining, 0, "OCR master body remains; rollback");
      assert.equal(snapshotRemaining, 0, "OCR frozen body remains; rollback");
    }
    return {
      apply, questionCount: questions.length, snapshotCount: snapshots.length,
      plannedMasters: masterPlan.length, plannedSnapshots: snapshotPlan.length,
      mastersUpdated, snapshotsUpdated, masterRemaining, snapshotRemaining,
      preservedBefore, preservedAfter, protectedData: protectedAfter,
      imagesChoicesAndGradingPreserved: true, learningHistoryAndRewardsPreserved: true,
    };
  }, { isolationLevel: "Serializable", timeout: 90000, maxWait: 10000 });
}
