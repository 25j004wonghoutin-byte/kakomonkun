import { getCurrentUser } from "@/lib/auth";
import { getOrCreateAiExplanation } from "@/lib/ai-explanations";
import { prisma } from "@/lib/prisma";
import { explainReviewAnswer } from "./ai-explanation";
import { createReviewAiHandler } from "./ai-handler";

export const reviewAiHandler = createReviewAiHandler({
  getUser: async () => {
    const user = await getCurrentUser();
    return user ? { id: user.id, roleName: user.role.name, status: user.status, deletedAt: user.deletedAt } : null;
  },
  explain: (actor, itemId, input) => explainReviewAnswer(prisma, actor, itemId, input, getOrCreateAiExplanation),
});
