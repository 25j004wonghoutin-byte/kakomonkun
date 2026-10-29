import { titleHistoryMemory } from "./title-history-memory.mjs";
import { makeTitleMemory } from "./title-memory.mjs";
import { TITLE_CATALOG } from "../../src/lib/titles/catalog.ts";

// Serialized boundary transactions model interleavings, not PostgreSQL lock enforcement.
export function makeLearningMemory(overrides = {}) {
  const base = makeTitleMemory({
    profile: { userId: "student", titleTrackingStartedAt: null, titleBackfilledAt: null, totalPoints: 0, totalPracticeCount: 0, totalAnswerCount: 0, totalCorrectCount: 0 },
    questions: [{ id: "q", explanation: "解説", category: { code: "technology" }, choices: [
      { id: "correct", choiceLabel: "ア", choiceText: "正解", isCorrect: true },
      { id: "wrong", choiceLabel: "イ", choiceText: "不正解", isCorrect: false },
    ] }],
    sessionQuestions: [], points: [], reviewItems: [], reviewAnswers: [], ...overrides,
  });
  const mutate = (row, data) => {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      row[key] = value && typeof value === "object" && "increment" in value ? (row[key] ?? 0) + value.increment : value && typeof value === "object" && "decrement" in value ? (row[key] ?? 0) - value.decrement : value;
    }
    return row;
  };
  const txFor = (state) => {
    const tx = makeTitleMemory(state).tx;
    const raw = tx.$queryRaw;
    tx.$queryRaw = (query, ...values) => query.sql?.includes("title-history")
      ? Promise.resolve([titleHistoryMemory(state, query.values[0], query.values[1])]) : raw(query, ...values);
    const question = (id) => state.questions.find((row) => row.id === id);
    const enrich = (row) => ({ ...row, question: question(row.questionId) });
    const matchesReview = (row, where) => {
      if (where.id !== undefined && row.id !== where.id || where.userId !== undefined && row.userId !== where.userId) return false;
      if (typeof where.status === "string" && row.status !== where.status || where.status?.in && !where.status.in.includes(row.status)) return false;
      if (where.question) {
        const q = question(row.questionId), filter = where.question;
        if (!q || filter.status && q.status !== filter.status || "deletedAt" in filter && q.deletedAt !== filter.deletedAt || filter.exam && q.exam.code !== filter.exam.code || filter.category && q.category.code !== filter.category.code) return false;
        if (filter.practiceAnswers?.some) { const a = filter.practiceAnswers.some; if (!state.practiceAnswers.some(answer => answer.questionId === q.id && answer.sessionId === a.sessionId && answer.isCorrect === a.isCorrect && state.sessions.some(session => session.id === a.sessionId && session.userId === a.session.userId))) return false; }
      }
      return true;
    };
    tx.user.update = async ({ data }) => mutate(state.user, data);
    tx.question = { findUnique: async ({ where }) => question(where.id) ?? null };
    tx.reviewNotebookItem = {
      findUnique: async ({ where, include }) => { const row = state.reviewItems.find(row => matchesReview(row, where)); return row ? include ? enrich(row) : row : null; },
      count: async ({ where }) => state.reviewItems.filter(row => matchesReview(row, where)).length,
      findMany: async ({ where, skip = 0, take }) => state.reviewItems.filter(row => matchesReview(row, where)).sort((a, b) => +b.lastWrongAt - +a.lastWrongAt || a.id.localeCompare(b.id)).slice(skip, take === undefined ? undefined : skip + take).map(enrich),
      upsert: async ({ where, create, update }) => {
        if (state.failReviewItem) throw Error("review item save failed");
        const row = state.reviewItems.find(row => row.userId === where.userId_questionId.userId && row.questionId === where.userId_questionId.questionId);
        if (row) return mutate(row, update);
        const added = { id: "11111111-1111-4111-8111-111111111111", lastReviewedAt: null, ...create }; state.reviewItems.push(added); return added;
      },
      update: async ({ where, data }) => mutate(state.reviewItems.find(row => row.id === where.id), data),
    };
    tx.reviewNotebookAnswer = {
      findUnique: async ({ where }) => state.reviewAnswers.find(row => row.userId === where.userId_requestId.userId && row.requestId === where.userId_requestId.requestId) ?? null,
      create: async ({ data }) => {
        if (state.failReviewReceipt) throw Error("review receipt save failed");
        if (state.reviewAnswers.some(row => row.userId === data.userId && row.requestId === data.requestId || row.itemId === data.itemId && row.expectedRevision === data.expectedRevision)) throw Object.assign(Error("duplicate receipt"), { code: "P2002" });
        state.reviewAnswers.push(data); return data;
      },
    };
    tx.studentProfile.update = async ({ data }) => mutate(state.profile, data);
    tx.studentProfile.upsert = async ({ create, update }) => state.profile ? mutate(state.profile, update) : (state.profile = create);
    tx.studentProfile.findUniqueOrThrow = async () => { if (!state.profile) throw Error("profile not found"); return state.profile; };
    tx.studentProfile.updateMany = async ({ where, data }) => {
      if (!state.profile || state.profile.totalPoints < where.totalPoints.gte) return { count: 0 };
      mutate(state.profile, data); return { count: 1 };
    };
    tx.title.findUnique = async ({ where }) => state.catalogTitles?.find((row) => row.id === where.id) ?? TITLE_CATALOG.map((row) => ({ id: row.key, catalogKey: row.key, name: row.name, pricePoints: row.pricePoints, acquisitionKind: row.acquisitionKind, isActive: true })).find((row) => row.id === where.id) ?? null;
    tx.userTitle.findUnique = async ({ where }) => state.owned.includes(where.userId_titleId.titleId) ? { titleId: where.userId_titleId.titleId } : null;
    tx.userTitle.create = async ({ data }) => {
      if (state.owned.includes(data.titleId)) throw Object.assign(new Error("duplicate ownership"), { code: "P2002" });
      state.owned.push(data.titleId); return data;
    };
    tx.userTitleUnlock.findUnique = async ({ where }) => state.unlocks.find((row) => row.userId === where.userId_titleId.userId && row.titleId === where.userId_titleId.titleId) ?? null;
    tx.randomQuizAttempt = {
      create: async ({ data }) => { const row = { id: `attempt-${state.random.length + 1}`, selectedChoiceId: null, isCorrect: null, answerDate: null, answeredAt: null, answerSequence: null, ...data }; state.random.push(row); return row; },
      findUnique: async ({ where }) => state.random.find((row) => row.id === where.id) ?? null,
      aggregate: async ({ where }) => ({ _max: { answerSequence: Math.max(0, ...state.random.filter((row) => row.userId === where.userId).map((row) => row.answerSequence ?? 0)) } }),
      update: async ({ where, data }) => mutate(state.random.find((row) => row.id === where.id), data),
      findMany: async ({ where }) => state.random.filter((row) => row.userId === where.userId && row.answeredAt !== null).sort((a, b) => a.answerSequence - b.answerSequence).map(enrich),
    };
    tx.practiceSession = {
      findUnique: async ({ where }) => state.sessions.find((row) => row.id === where.id && (where.userId === undefined || row.userId === where.userId)) ?? null,
      findFirst: async ({ where }) => state.sessions.filter((row) => row.userId === where.userId && row.status === "completed").sort((a, b) => b.completedAt - a.completedAt)[0] ?? null,
      findMany: async ({ where }) => state.sessions.filter((row) => row.userId === where.userId && row.status === where.status).sort((a, b) => a.completedAt - b.completedAt),
      update: async ({ where, data }) => mutate(state.sessions.find((row) => row.id === where.id), data),
    };
    tx.practiceSessionQuestion = { findUnique: async ({ where }) => state.sessionQuestions.find((row) => row.sessionId === where.sessionId_questionId.sessionId && row.questionId === where.sessionId_questionId.questionId) ?? null };
    tx.practiceAnswer = {
      create: async ({ data }) => { state.practiceAnswers.push(data); return data; },
      findUnique: async ({ where }) => state.practiceAnswers.find((row) => row.sessionId === where.sessionId_questionId.sessionId && row.questionId === where.sessionId_questionId.questionId) ?? null,
      findMany: async ({ where }) => state.practiceAnswers.filter((row) => state.sessions.some((session) => session.id === row.sessionId && session.userId === where.session.userId)).map(enrich),
    };
    tx.studentActivityDay.upsert = async ({ where, create, update }) => {
      const existing = state.activities.find((row) => row.userId === where.userId_activityDate.userId && +row.activityDate === +where.userId_activityDate.activityDate);
      if (existing) return mutate(existing, update);
      state.activities.push(create); return create;
    };
    tx.pointTransaction = {
      count: async ({ where }) => state.points.filter((row) => row.userId === where.userId && row.reason === where.reason && +row.transactionDate === +where.transactionDate).length,
      create: async ({ data }) => { state.points.push(data); return data; },
    };
    tx.studentNavigationProgress.findUnique = async ({ where }) => state.navigation.find((row) => row.userId === where.userId_tabId.userId && row.tabId === where.userId_tabId.tabId) ?? null;
    tx.studentNavigationProgress.upsert = async ({ where, create, update }) => {
      const row = state.navigation.find((item) => item.userId === where.userId_tabId.userId && item.tabId === where.userId_tabId.tabId);
      if (row) return mutate(row, update);
      state.navigation.push(create); return create;
    };
    tx.boardPost.findUnique = async ({ where }) => state.posts.find((row) => row.id === where.id) ?? null;
    tx.boardPost.create = async ({ data }) => { const row = { id: `post-${state.posts.length + 1}`, isPinned: false, deletedAt: null, createdAt: new Date(), ...data }; state.posts.push(row); return row; };
    tx.boardComment.create = async ({ data }) => { const row = { id: `comment-${state.comments.length + 1}`, createdAt: new Date(), deletedAt: null, ...data }; state.comments.push(row); return row; };
    tx.notification.createMany = async ({ data }) => {
      if (state.failNotifications) throw new Error("notification save failed");
      let count = 0;
      for (const row of data) {
        if (!state.notifications.some((saved) => saved.type === row.type && saved.recipientId === row.recipientId && saved.titleId === row.titleId && saved.boardCommentId === row.boardCommentId && saved.boardPostId === row.boardPostId)) { state.notifications.push(row); count++; }
      }
      return { count };
    };
    return tx;
  };
  let queue = Promise.resolve();
  const prisma = { $transaction(callback) {
    const run = queue.then(async () => {
      const draft = structuredClone(base.state);
      const result = await callback(txFor(draft));
      Object.assign(base.state, draft);
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  } };
  return { state: base.state, prisma, tx: txFor(base.state) };
}
