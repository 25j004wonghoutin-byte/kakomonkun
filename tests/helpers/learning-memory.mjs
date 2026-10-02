import { makeTitleMemory } from "./title-memory.mjs";

// Serialized boundary transactions model interleavings, not PostgreSQL lock enforcement.
export function makeLearningMemory(overrides = {}) {
  const base = makeTitleMemory({
    profile: { userId: "student", titleTrackingStartedAt: null, titleBackfilledAt: null, totalPoints: 0, totalPracticeCount: 0, totalAnswerCount: 0, totalCorrectCount: 0 },
    questions: [{ id: "q", explanation: "解説", category: { code: "technology" }, choices: [
      { id: "correct", choiceLabel: "ア", choiceText: "正解", isCorrect: true },
      { id: "wrong", choiceLabel: "イ", choiceText: "不正解", isCorrect: false },
    ] }],
    sessionQuestions: [], points: [], ...overrides,
  });
  const mutate = (row, data) => {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      row[key] = value && typeof value === "object" && "increment" in value ? (row[key] ?? 0) + value.increment : value;
    }
    return row;
  };
  const txFor = (state) => {
    const tx = makeTitleMemory(state).tx;
    const question = (id) => state.questions.find((row) => row.id === id);
    const enrich = (row) => ({ ...row, question: question(row.questionId) });
    tx.user.update = async ({ data }) => mutate(state.user, data);
    tx.question = { findUnique: async ({ where }) => question(where.id) ?? null };
    tx.studentProfile.update = async ({ data }) => mutate(state.profile, data);
    tx.studentProfile.upsert = async ({ create, update }) => state.profile ? mutate(state.profile, update) : (state.profile = create);
    tx.randomQuizAttempt = {
      create: async ({ data }) => { const row = { id: `attempt-${state.random.length + 1}`, selectedChoiceId: null, isCorrect: null, answerDate: null, answeredAt: null, answerSequence: null, ...data }; state.random.push(row); return row; },
      findUnique: async ({ where }) => state.random.find((row) => row.id === where.id) ?? null,
      aggregate: async ({ where }) => ({ _max: { answerSequence: Math.max(0, ...state.random.filter((row) => row.userId === where.userId).map((row) => row.answerSequence ?? 0)) } }),
      update: async ({ where, data }) => mutate(state.random.find((row) => row.id === where.id), data),
      findMany: async ({ where }) => state.random.filter((row) => row.userId === where.userId && row.answeredAt !== null).sort((a, b) => a.answerSequence - b.answerSequence).map(enrich),
    };
    tx.practiceSession = {
      findUnique: async ({ where }) => state.sessions.find((row) => row.id === where.id) ?? null,
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
