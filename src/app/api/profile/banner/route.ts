import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createProfileBannerHandler } from "@/lib/profile-banner-update";

export const PATCH = createProfileBannerHandler({
  getUser: getCurrentUser,
  updateBanner: (userId, bannerColor) => prisma.studentProfile.update({ where: { userId }, data: { bannerColor }, select: { userId: true } }),
});
