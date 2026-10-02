import { TITLE_CATALOG } from "../../src/lib/titles/catalog.ts";

// This boundary fake is not evidence of real PostgreSQL concurrency or lock enforcement.
export function makeTitleMemory(overrides = {}) {
  const state = {
    user: { id: "student", role: { name: "student" }, status: "active", deletedAt: null },
    profile: { titleTrackingStartedAt: null, titleBackfilledAt: null, totalAnswerCount: 99999 },
    daily: [], random: [], practiceAnswers: [], sessions: [], activities: [],
    navigation: [], posts: [], comments: [], owned: [], unlocks: [], notifications: [], locks: [],
    failNotifications: false,
    ...overrides,
  };
  const categoryFilter = (rows, args) => rows.filter((row) => {
    if (args.where?.userId && row.userId && row.userId !== args.where.userId) return false;
    if (args.where?.session?.userId && row.session?.userId && row.session.userId !== args.where.session.userId) return false;
    if (args.where?.answeredAt?.not === null && row.answeredAt == null) return false;
    if (args.where?.status && row.status !== args.where.status) return false;
    return true;
  });
  const txFor = (draft) => ({
    $queryRaw: async (strings) => { draft.locks.push(strings.join("?")); return [{ id: "student" }]; },
    user: { findUnique: async () => draft.user },
    studentProfile: {
      findUnique: async () => draft.profile,
      update: async ({ data }) => { Object.assign(draft.profile, data); return draft.profile; },
    },
    dailyQaAnswer: { findMany: async (args) => categoryFilter(draft.daily, args) },
    randomQuizAttempt: { findMany: async (args) => categoryFilter(draft.random, args) },
    practiceAnswer: { findMany: async (args) => categoryFilter(draft.practiceAnswers, args) },
    practiceSession: { findMany: async (args) => categoryFilter(draft.sessions, args) },
    studentActivityDay: { findMany: async () => draft.activities },
    studentNavigationProgress: { findMany: async () => draft.navigation },
    boardPost: { count: async (args) => draft.posts.filter((row) => args.where?.deletedAt === null ? row.deletedAt === null : true).length },
    boardComment: { count: async (args) => draft.comments.filter((row) => args.where?.deletedAt === null ? row.deletedAt === null : true).length },
    userTitle: { findMany: async () => draft.owned.map((key) => ({ titleId: key, title: { catalogKey: key.startsWith("v1-") ? key : null } })) },
    title: {
      findMany: async (args) => TITLE_CATALOG
        .filter((title) => !args.where?.catalogKey?.in || args.where.catalogKey.in.includes(title.key))
        .map((title) => ({ id: title.key, catalogKey: title.key, name: title.name, acquisitionKind: title.acquisitionKind, isActive: true })),
    },
    userTitleUnlock: {
      findMany: async () => draft.unlocks,
      createManyAndReturn: async ({ data }) => {
        const inserted = [];
        for (const row of data) {
          if (!draft.unlocks.some((saved) => saved.userId === row.userId && saved.titleId === row.titleId)) {
            draft.unlocks.push(row);
            inserted.push({ titleId: row.titleId });
          }
        }
        return inserted;
      },
    },
    notification: {
      createMany: async ({ data }) => {
        if (draft.failNotifications) throw new Error("notification save failed");
        let count = 0;
        for (const row of data) {
          if (!draft.notifications.some((saved) => saved.recipientId === row.recipientId && saved.titleId === row.titleId)) {
            draft.notifications.push(row);
            count++;
          }
        }
        return { count };
      },
    },
  });
  const prisma = {
    $transaction: async (callback) => {
      const draft = structuredClone(state);
      const result = await callback(txFor(draft));
      Object.assign(state, draft);
      return result;
    },
  };
  return { state, prisma, tx: txFor(state) };
}
