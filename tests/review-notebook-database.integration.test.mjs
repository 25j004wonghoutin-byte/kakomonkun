import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("review notebook real constraints transactions retries and separate-connection races", {
  skip: process.env.KAKOMON_RUN_REVIEW_DB_TESTS !== "1", timeout: 180000,
}, async t => {
  const { withReviewDb } = await import("./helpers/review-notebook-db.mjs");
  const { recordWrongPracticeAnswer, saveReviewAnswer } = await import("../src/lib/review-notebook/write.ts");
  const { readReviewItem, readReviewList, countPracticeReviewItems } = await import("../src/lib/review-notebook/read.ts");
  const { lockTitleOwner } = await import("../src/lib/titles/unlocks.ts");
  const { savePracticeAnswer } = await import("../src/lib/titles/learning-events.ts");
  await withReviewDb(async f => {
    const register = (questionId, userId = f.actor.id) => f.db.$transaction(async tx => {
      await lockTitleOwner(tx, userId); await recordWrongPracticeAnswer(tx, { userId, questionId, answeredAt: f.now });
      return tx.reviewNotebookItem.findUniqueOrThrow({ where: { userId_questionId: { userId, questionId } } });
    });
    const inputFor = async itemId => { const detail = await readReviewItem(f.db, f.actor.id, itemId); return { requestId: randomUUID(), expectedRevision: detail.revision, questionVersion: detail.questionVersion, selectedChoiceId: detail.question.choices[0].id }; };
    const save = (itemId, input, db = f.db) => db.$transaction(tx => saveReviewAnswer(tx, f.actor, itemId, input, f.now), { timeout: 30000 });
    const query = { status: "all", examCode: null, categoryCode: null, sessionId: null, page: 1 };
    await t.test("unique ownership CHECKs and owner-bound receipt FK are enforced", async () => {
      const item = await register(f.questionIds[0]);
      await assert.rejects(f.other.reviewNotebookItem.create({ data: { userId: f.actor.id, questionId: f.questionIds[0], firstWrongAt: f.now, lastWrongAt: f.now } }), e => e.code === "P2002");
      for (const data of [{ status: "invalid" }, { revision: -1 }]) await assert.rejects(f.other.reviewNotebookItem.update({ where: { id: item.id }, data }));
      const input = await inputFor(item.id); await save(item.id, input);
      await assert.rejects(f.other.reviewNotebookAnswer.create({ data: { userId: f.otherActor.id, itemId: item.id, ...input, requestId: randomUUID(), expectedRevision: 100, isCorrect: true, answeredAt: f.now, result: {} } }), e => e.code === "P2003");
      await assert.rejects(f.other.reviewNotebookAnswer.create({ data: { userId: f.actor.id, itemId: item.id, ...input, requestId: randomUUID(), isCorrect: true, answeredAt: f.now, result: {} } }), e => e.code === "P2002");
      await assert.rejects(f.other.questionChoice.delete({ where: { id: input.selectedChoiceId } }), e => e.code === "P2003");
    });
    await t.test("anonymous and browser-authenticated roles cannot directly read or write", async () => {
      for (const role of ["anon", "authenticated"]) for (const table of ["review_notebook_items", "review_notebook_answers"]) {
        await assert.rejects(f.db.$transaction(async tx => { await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`); await tx.$queryRawUnsafe(`SELECT * FROM public.${table} LIMIT 1`); }));
        await assert.rejects(f.db.$transaction(async tx => { await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`); await tx.$executeRawUnsafe(`DELETE FROM public.${table} WHERE false`); }));
      }
    });
    await t.test("registration error rolls back ordinary answer activity and counts", async () => {
      const q = f.questions[1], item = await register(q.id);
      await f.db.reviewNotebookItem.update({ where: { id: item.id }, data: { revision: 2147483647 } });
      const before = await f.db.practiceSession.findUniqueOrThrow({ where: { id: f.sessionIds[0] } });
      const profile = await f.db.studentProfile.findUniqueOrThrow({ where: { userId: f.actor.id } });
      await assert.rejects(f.db.$transaction(tx => savePracticeAnswer(tx, { id: f.actor.id, isStudent: true }, f.sessionIds[0], { questionId: q.id, selectedChoiceId: q.choices[1].id }, f.now), { timeout: 30000 }));
      assert.equal(await f.db.practiceAnswer.count({ where: { sessionId: f.sessionIds[0], questionId: q.id } }), 0);
      assert.deepEqual(await f.db.practiceSession.findUniqueOrThrow({ where: { id: f.sessionIds[0] } }), before);
      assert.deepEqual(await f.db.studentProfile.findUniqueOrThrow({ where: { userId: f.actor.id } }), profile);
      assert.equal(await f.db.studentActivityDay.count({ where: { userId: f.actor.id } }), 0);
    });
    await t.test("independent connections accept exactly one request per revision", async () => {
      const item = await register(f.questionIds[2]), input = await inputFor(item.id);
      const results = await Promise.allSettled([save(item.id, input), save(item.id, { ...input, requestId: randomUUID() }, f.other)]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
      assert.equal((await f.db.reviewNotebookItem.findUniqueOrThrow({ where: { id: item.id } })).revision, 2);
      assert.equal(await f.db.reviewNotebookAnswer.count({ where: { itemId: item.id } }), 1);
    });
    await t.test("lost response then ordinary mistake and replay preserves the new unfinished state", async () => {
      const q = f.questions[3], item = await register(q.id), input = await inputFor(item.id);
      const original = await save(item.id, input);
      await f.db.$transaction(tx => savePracticeAnswer(tx, { id: f.actor.id, isStudent: true }, f.sessionIds[0], { questionId: q.id, selectedChoiceId: q.choices[1].id }, f.now), { timeout: 30000 });
      const replay = await save(item.id, input, f.other);
      assert.deepEqual(replay, { ...original, replayed: true });
      const current = await readReviewItem(f.db, f.actor.id, item.id); assert.equal(current.status, "unreviewed"); assert.equal(current.revision, 3);
      assert.equal(await countPracticeReviewItems(f.db, f.actor.id, f.sessionIds[0]), 1);
      await assert.rejects(readReviewList(f.db, f.otherActor.id, { ...query, sessionId: f.sessionIds[0] }), e => e.status === 404);
    });
    await t.test("choice edits hidden questions and other owners cannot save stale answers", async () => {
      const q = f.questions[4], item = await register(q.id), input = await inputFor(item.id);
      await f.db.questionChoice.update({ where: { id: q.choices[0].id }, data: { choiceText: "更新後の正解", updatedAt: new Date(+q.choices[0].updatedAt + 1000) } });
      await assert.rejects(save(item.id, input), e => e.status === 409);
      await f.db.question.update({ where: { id: q.id }, data: { status: "draft" } });
      await assert.rejects(readReviewItem(f.db, f.actor.id, item.id), e => e.status === 404);
      await assert.rejects(save(item.id, input), e => e.status === 404);
      await assert.rejects(readReviewItem(f.db, f.otherActor.id, item.id), e => e.status === 404);
    });
    await t.test("review leaves normal practice points titles activity and rankings unchanged", async () => {
      const item = await register(f.questionIds[5]), input = await inputFor(item.id);
      const snapshot = async () => {
        const rows = {};
        rows.profile = await f.db.studentProfile.findUnique({ where: { userId: f.actor.id } });
        for (const model of ["pointTransaction", "userTitleUnlock", "userTitle", "studentActivityDay", "randomQuizAttempt", "dailyQaAnswer", "monthlyRanking", "mockAttempt"]) rows[model] = await f.db[model].findMany({ where: { userId: f.actor.id } });
        rows.practice = await f.db.practiceSession.findMany({ where: { userId: f.actor.id }, include: { answers: true } });
        return rows;
      };
      const before = await snapshot(); await save(item.id, input); assert.deepEqual(await snapshot(), before);
    });
    await t.test("a new choice cannot be inserted between locked version read and grading", async () => {
      const item = await register(f.questionIds[6]), input = await inputFor(item.id);
      let ready, release;
      const seen = new Promise(resolve => { ready = resolve; });
      const resume = new Promise(resolve => { release = resolve; });
      const grading = f.db.$transaction(async tx => {
        const wrapped = new Proxy(tx, { get(target, key) {
          if (key === "$queryRaw") return async (...args) => {
            const result = await target.$queryRaw(...args);
            if (args[0].join("?").includes("FROM public.question_choices")) { ready(); await resume; }
            return result;
          };
          return target[key];
        } });
        return saveReviewAnswer(wrapped, f.actor, item.id, input, f.now);
      }, { timeout: 15000 }).then(value => ({ value }), error => ({ error }));
      let outcome;
      try {
        await Promise.race([seen, grading.then(value => { throw value.error ?? Error("grading did not pause"); })]);
        await assert.rejects(f.other.$transaction(async tx => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '300ms'");
          return tx.questionChoice.create({ data: { questionId: f.questionIds[6], choiceLabel: "ウ", choiceText: "同時追加", sortOrder: 3 } });
        }));
      } finally { release(); outcome = await grading; }
      assert.equal(outcome.error, undefined);
      assert.equal(outcome.value.answer.isCorrect, true);
    });
    await t.test("zero or multiple correct choices cannot commit a review result", async () => {
      const q = f.questions[7], item = await register(q.id);
      for (const isCorrect of [false, true]) {
        await f.db.questionChoice.updateMany({ where: { questionId: q.id }, data: { isCorrect } });
        const input = await inputFor(item.id);
        await assert.rejects(save(item.id, input), e => e.status === 500);
        assert.equal(await f.db.reviewNotebookAnswer.count({ where: { itemId: item.id } }), 0);
        assert.equal((await f.db.reviewNotebookItem.findUniqueOrThrow({ where: { id: item.id } })).revision, 1);
      }
      await f.db.questionChoice.update({ where: { id: q.choices[1].id }, data: { isCorrect: false } });
    });
    await t.test("actual list has ten-item pages, no answer leakage, and readonly legacy results", async () => {
      for (const id of f.questionIds.slice(6)) await register(id);
      const before = await f.db.reviewNotebookItem.count({ where: { userId: f.actor.id } });
      const page = await readReviewList(f.db, f.actor.id, query); assert.equal(page.items.length, 10); assert.equal(page.pageCount, 2);
      assert.equal(JSON.stringify(page).includes("isCorrect"), false);
      assert.equal(await countPracticeReviewItems(f.db, f.otherActor.id, f.sessionIds[1]), 0);
      assert.equal(await f.db.reviewNotebookItem.count({ where: { userId: f.actor.id } }), before);
    });
  });
});
