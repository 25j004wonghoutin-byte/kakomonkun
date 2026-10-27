import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../prisma/generated/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadTestConfig } from "../../scripts/test-environment.mjs";

export async function preflightReviewSchema(db) {
  const rows = await db.$queryRaw`SELECT relname FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND relname IN ('review_notebook_items','review_notebook_answers') AND relkind='r'`;
  if (rows.length !== 2) throw Object.assign(new Error("Review notebook tables are missing; stopped before fixture writes"), { code: "review_schema_missing" });
}

/** All writes and cleanup are scoped to this invocation's new UUIDs. */
export async function withReviewDb(run) {
  const config = loadTestConfig();
  const clients = [0, 1].map(() => new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DIRECT_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000, allowExitOnIdle: true }), errorFormat: "minimal" }));
  const [db, other] = clients;
  const runId = randomUUID(), userIds = [], questionIds = [], sessionIds = [], now = new Date("2026-10-26T02:00:00Z");
  try {
    await preflightReviewSchema(db);
    const role = await db.role.findUniqueOrThrow({ where: { name: "student" } });
    const exam = await db.exam.findUniqueOrThrow({ where: { code: "it_passport" } });
    const category = await db.questionCategory.findUniqueOrThrow({ where: { code: "technology" } });
    for (let i = 0; i < 2; i++) {
      const id = randomUUID(); userIds.push(id);
      await db.user.create({ data: { id, email: `review-qa-${runId}-${i}@example.invalid`, displayName: `復習検証 ${i + 1}`, roleId: role.id, studentProfile: { create: {} } } });
    }
    const questions = [];
    for (let i = 0; i < 12; i++) {
      const id = randomUUID(); questionIds.push(id);
      const question = await db.question.create({ data: { id, sourceKey: `review-qa:${runId}:${i}`, examId: exam.id, categoryId: category.id, sourceYear: 2026, sourceSeason: "QA", questionNo: i + 1, questionText: `復習検証問題 ${i + 1}`, explanation: "検証用の解説", choices: { create: [{ choiceLabel: "ア", choiceText: "正解", isCorrect: true, sortOrder: 1 }, { choiceLabel: "イ", choiceText: "誤り", isCorrect: false, sortOrder: 2 }] } }, include: { choices: { orderBy: { sortOrder: "asc" } } } });
      questions.push(question);
    }
    for (const userId of userIds) {
      const id = randomUUID(); sessionIds.push(id);
      await db.practiceSession.create({ data: { id, userId, examId: exam.id, questionCount: 30, sessionQuestions: { create: questionIds.map((questionId, i) => ({ questionId, orderNo: i + 1 })) } } });
    }
    const [actor, otherActor] = userIds.map(id => ({ id, roleName: "student", status: "active", deletedAt: null }));
    return await run({ db, other, actor, otherActor, runId, questionIds, sessionIds, questions, now });
  } finally {
    try {
      await other.$disconnect();
      if (userIds.length || questionIds.length) await db.$transaction(async tx => {
        await tx.reviewNotebookAnswer.deleteMany({ where: { userId: { in: userIds } } });
        await tx.reviewNotebookItem.deleteMany({ where: { userId: { in: userIds } } });
        await tx.notification.deleteMany({ where: { OR: [{ recipientId: { in: userIds } }, { actorId: { in: userIds } }] } });
        await tx.userTitleUnlock.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userTitle.deleteMany({ where: { userId: { in: userIds } } });
        await tx.pointTransaction.deleteMany({ where: { userId: { in: userIds } } });
        await tx.studentActivityDay.deleteMany({ where: { userId: { in: userIds } } });
        await tx.studentNavigationProgress.deleteMany({ where: { userId: { in: userIds } } });
        await tx.practiceSession.deleteMany({ where: { id: { in: sessionIds }, userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds }, email: { startsWith: `review-qa-${runId}-` } } });
        await tx.question.deleteMany({ where: { id: { in: questionIds }, sourceKey: { startsWith: `review-qa:${runId}:` } } });
      }, { timeout: 30000 });
    } finally { await db.$disconnect(); }
  }
}
