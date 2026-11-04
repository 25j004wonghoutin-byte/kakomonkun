import { getCurrentUser } from "@/lib/auth";
import { createMeHandler, getOwnedTitleCount } from "@/lib/me";
import { prisma } from "@/lib/prisma";

export const GET = createMeHandler({
  getUser: getCurrentUser,
  getCurrentTitleName: async userId => (await prisma.studentProfile.findUnique({ where: { userId }, select: { currentTitle: { select: { name: true } } } }))?.currentTitle?.name ?? null,
  countOwnedTitles: (userId) => getOwnedTitleCount(prisma, userId),
});
