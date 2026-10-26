import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createReviewNotebookHandlers } from "./handlers";
import { readReviewItem, readReviewList } from "./read";
import { saveReviewAnswer } from "./write";

export const reviewNotebookHandlers = createReviewNotebookHandlers({
  getUser: async () => {
    const user = await getCurrentUser();
    return user ? { id: user.id, roleName: user.role.name, status: user.status, deletedAt: user.deletedAt } : null;
  },
  service: {
    list: (userId, query) => readReviewList(prisma, userId, query),
    item: (userId, itemId) => readReviewItem(prisma, userId, itemId),
    answer: (actor, itemId, input) => prisma.$transaction(tx => saveReviewAnswer(tx, actor, itemId, input, new Date()), { timeout: 30000 }),
  },
});
