import { getCurrentUser } from "@/lib/auth";
import { createMeHandler, getOwnedTitleCount } from "@/lib/me";
import { prisma } from "@/lib/prisma";

export const GET = createMeHandler({
  getUser: getCurrentUser,
  countOwnedTitles: (userId) => getOwnedTitleCount(prisma, userId),
});
