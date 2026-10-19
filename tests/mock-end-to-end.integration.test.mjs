import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { withMockDb } from "./helpers/mock-db.mjs";

function privateDto(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!["isCorrect", "correctChoiceId", "explanation"].includes(key), `unexpected private field: ${key}`);
    privateDto(item);
  }
}

test("two exams flow through real HTTP contracts, deadline grading, retryable ranking rewards and manual titles", {
  skip: process.env.KAKOMON_RUN_MOCK_DB_QA !== "1", timeout: 600000,
}, async t => {
  const { startMockAttempt: start } = await import("../src/lib/mock-exams/start.ts");
  const { saveMockAnswer: save } = await import("../src/lib/mock-exams/answers.ts");
  const { submitMockAttempt: submit } = await import("../src/lib/mock-exams/submit.ts");
  const { getMockList, getMockAttempt, getMockResult } = await import("../src/lib/mock-exams/read.ts");
  const { getMockRanking } = await import("../src/lib/mock-exams/ranking.ts");
  const { settleMockExamBatch: settle } = await import("../src/lib/mock-exams/settlement.ts");
  const { sendMockRemindersBatch: remind } = await import("../src/lib/mock-exams/reminders.ts");
  const { purchaseTitle } = await import("../src/lib/titles/purchase.ts");
  const { createMockHandlers } = await import("../src/lib/mock-exams/handlers.ts");
  const { MockAttemptView } = await import("../src/app/mock-exam/attempts/[attemptId]/mock-attempt.tsx");
  const { MockResultView } = await import("../src/app/mock-exam/attempts/[attemptId]/result/mock-result.tsx");
  await withMockDb({ examCode: "fe", month: "2047-01", userCount: 4 }, async f => {
    await withMockDb({ examCode: "it_passport", month: "2047-01", userCount: 1 }, async it => {
      const db = f.db, clock = f.clock;
      const services = {
        getMockList: (actor, month) => getMockList(db, actor, month, clock),
        startMockAttempt: (actor, input) => start(db, actor, input, clock),
        getMockAttempt: (actor, id) => getMockAttempt(db, actor, id, clock),
        saveMockAnswer: (actor, input) => save(db, actor, input, clock),
        submitMockAttempt: (actor, input) => submit(db, actor, input, clock),
        getMockResult: (actor, id) => getMockResult(db, actor, id, clock),
        getRanking: (actor, code, month) => getMockRanking(db, actor, code, month, clock),
      };
      const handlers = actor => createMockHandlers({ getUser: async () => actor, services });
      const request = (body, method = "POST") => new Request("https://app.example/api/mock", {
        method, headers: { origin: "https://app.example", "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const results = [];
      const take = async (fixture, actor, count, submitNow = true) => {
        const api = handlers(actor);
        const response = await api.start(request({ requestId: randomUUID() }), { mockExamId: fixture.mockExamId });
        assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /private, no-store/);
        const { attempt } = await response.json(); privateDto(attempt);
        const html = renderToStaticMarkup(React.createElement(MockAttemptView, { attempt, index: 0, remainingSeconds: 5400, saving: false, blocked: false, onSelect() {}, onMove() {}, onSubmit() {} }));
        assert.ok(!/correctChoiceId|isCorrect|explanation|MUTATED_SOURCE/.test(html));
        let revision = 0;
        for (const q of fixture.questions.slice(0, count)) {
          const saved = await api.answer(request({ mockQuestionId: q.id, selectedChoiceId: q.correctChoiceId, expectedRevision: 0, requestId: randomUUID() }), { attemptId: attempt.id });
          assert.equal(saved.status, 200); const payload = await saved.json(); privateDto(payload); revision = payload.attemptRevision;
        }
        if (!submitNow) return attempt;
        const submitted = await api.submit(request({ expectedRevision: revision }), { attemptId: attempt.id });
        assert.equal(submitted.status, 200); const result = await submitted.json(); privateDto(result);
        assert.equal(result.correctCount, count); assert.equal(result.review, null);
        const resultHtml = renderToStaticMarkup(React.createElement(MockResultView, { result }));
        assert.ok(!/correctChoiceId|isCorrect|explanation|固定された検証用の解説/.test(resultHtml));
        results.push(result); return result;
      };
      let pending;
      await t.test("both first/second attempts update best score, source edits stay frozen and access stays private", async () => {
        await db.question.update({ where: { id: f.questions[0].sourceQuestionId }, data: { questionText: "MUTATED_SOURCE", explanation: "MUTATED_SOURCE" } });
        await db.questionChoice.update({ where: { id: f.questions[0].originalCorrectChoiceId }, data: { isCorrect: false } });
        for (const fixture of [f, it]) {
          const first = await take(fixture, f.actor, 1), second = await take(fixture, f.actor, 2);
          assert.equal(first.earnedPoints, 20); assert.equal(second.earnedPoints, 0);
          assert.equal(second.bestAttemptId, second.attemptId); assert.ok(second.bestScore > first.bestScore);
        }
        await take(f, f.actors[1], 2);
        pending = await take(f, f.actors[2], 1, false);
        assert.equal((await handlers(f.actors[1]).attempt(request(undefined, "GET"), { attemptId: pending.id })).status, 403);
        assert.equal((await handlers({ ...f.actor, roleName: "teacher" }).list(new Request("https://app.example/api/mock?month=2047-01"))).status, 403);
        await db.user.update({ where: { id: f.actors[3].id }, data: { status: "inactive" } });
        assert.equal((await handlers(f.actors[3]).list(new Request("https://app.example/api/mock?month=2047-01"))).status, 403);
        await db.user.update({ where: { id: f.actors[3].id }, data: { status: "active" } });
        assert.equal((await db.pointTransaction.aggregate({ where: { userId: f.actor.id, reason: "mock_participation" }, _sum: { points: true } }))._sum.points, 40);
        assert.equal((await db.studentProfile.findUniqueOrThrow({ where: { userId: f.actor.id } })).totalPracticeCount, 0);
        assert.equal(await db.practiceSession.count({ where: { userId: f.actor.id } }), 0);
      });
      await t.test("20th reminder excludes either-exam submissions and notifies unsubmitted students once", async () => {
        f.setNow(new Date("2047-01-20T09:00:00+09:00"));
        const scoped = db.$extends({ query: { user: { findMany({ args, query }) { return query({ ...args, where: { AND: [args.where ?? {}, { id: { in: f.actors.map(actor => actor.id) } }] } }); } } } });
        assert.equal((await remind(scoped, "2047-01", null, clock)).sent, 2);
        assert.equal((await remind(scoped, "2047-01", null, clock)).sent, 0);
        for (const [index, expected] of [0, 0, 1, 1].entries()) assert.equal(await db.notification.count({ where: { recipientId: f.actors[index].id, type: "mock_exam_reminder" } }), expected);
      });
      let ranks;
      await t.test("25th grades the saved selection, freezes 1/1/3 and rolls back a failed payout before retry", async () => {
        f.setNow(new Date("2047-01-25T00:00:00+09:00"));
        assert.deepEqual(await settle(db, f.mockExamId, clock), { phase: "ranked", remaining: 3 });
        assert.equal((await db.mockAttempt.findUniqueOrThrow({ where: { id: pending.id } })).correctCount, 1);
        ranks = await db.monthlyRanking.findMany({ where: { mockExamId: f.mockExamId }, orderBy: [{ rankNo: "asc" }, { userId: "asc" }] });
        assert.deepEqual(ranks.map(row => row.rankNo), [1, 1, 3]);
        const broken = db.$extends({ query: { notification: { async createMany({ args, query }) { await query(args); throw Error("e2e payout fault after notification"); } } } });
        await assert.rejects(settle(broken, f.mockExamId, clock), /e2e payout fault/);
        assert.equal(await db.pointTransaction.count({ where: { userId: { in: f.actors.map(actor => actor.id) }, reason: "mock_rank_reward" } }), 0);
        assert.equal(await db.monthlyRanking.count({ where: { mockExamId: f.mockExamId, rewardProcessedAt: { not: null } } }), 0);
        assert.deepEqual(await settle(db, f.mockExamId, clock), { phase: "complete", remaining: 0 });
        await settle(f.other, f.mockExamId, clock);
        const paid = await db.monthlyRanking.findMany({ where: { mockExamId: f.mockExamId }, orderBy: [{ rankNo: "asc" }, { userId: "asc" }] });
        assert.deepEqual(paid.map(row => row.rewardPoints), [150, 150, 75]);
        for (const row of paid) assert.equal(await db.pointTransaction.count({ where: { userId: row.userId, reason: "mock_rank_reward", sourceId: row.id } }), 1);
        await settle(db, it.mockExamId, clock); await settle(db, it.mockExamId, clock);
      });
      await t.test("qualification is permanent, purchase is manual and history retains frozen ranks after profile changes", async () => {
        const champion = await db.title.findUniqueOrThrow({ where: { catalogKey: "v1-009" } });
        assert.equal(await db.userTitle.count({ where: { userId: f.actor.id, titleId: champion.id } }), 0);
        assert.equal(await db.userTitleUnlock.count({ where: { userId: f.actor.id, titleId: champion.id } }), 1);
        assert.equal(await db.notification.count({ where: { recipientId: f.actor.id, titleId: champion.id } }), 1);
        const before = await db.studentProfile.findUniqueOrThrow({ where: { userId: f.actor.id } });
        const bought = await db.$transaction(tx => purchaseTitle(tx, f.actor.id, champion.id, f.now()), { timeout: 30000 });
        assert.equal(bought.totalPoints, before.totalPoints);
        assert.equal((await db.studentProfile.findUniqueOrThrow({ where: { userId: f.actor.id } })).currentTitleId, null);
        await db.studentProfile.update({ where: { userId: f.actor.id }, data: { currentTitleId: champion.id, avatarUrl: "https://untrusted.example/avatar.png" } });
        await db.user.update({ where: { id: f.actor.id }, data: { displayName: "変更後の学生名" } });
        f.setNow(new Date("2047-02-02T12:00:00+09:00"));
        const history = await getMockList(db, f.actor, "2047-01", clock);
        assert.equal(history.exams.filter(exam => exam.state === "closed" && exam.results.length === 2).length, 2);
        assert.equal(history.exams.find(exam => exam.examCode === "fe").results[0].review[0].explanation, "固定された検証用の解説");
        const view = await getMockRanking(db, f.actor, "fe", "2047-01", clock);
        assert.equal(view.state, "final"); assert.equal(view.rewardsComplete, true);
        assert.equal(view.mine.rankNo, 1); assert.equal(view.mine.displayName, "変更後の学生名"); assert.equal(view.mine.avatarUrl, null);
        assert.equal(view.mine.currentTitleName, champion.name);
        const unchanged = await db.monthlyRanking.findMany({ where: { mockExamId: f.mockExamId }, orderBy: [{ rankNo: "asc" }, { userId: "asc" }] });
        assert.deepEqual(unchanged.map(row => [row.id, row.rankNo, row.bestAttemptId]), ranks.map(row => [row.id, row.rankNo, row.bestAttemptId]));
        assert.equal(await db.notification.count({ where: { recipientId: f.actor.id, titleId: champion.id } }), 1);
        assert.equal((await db.studentProfile.findUniqueOrThrow({ where: { userId: f.actor.id } })).totalAnswerCount, 6);
      });
    });
  });
});
