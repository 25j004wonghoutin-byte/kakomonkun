import type { Prisma } from "../../prisma/generated/client";

export const STARTER_TITLE_NAME = "駆け出しのエンジニア";

export async function ensureStarterTitleForStudent(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const starterTitle = await tx.title.upsert({
    where: { name: STARTER_TITLE_NAME },
    create: {
      name: STARTER_TITLE_NAME,
      description: "学習を始めた学生の初期称号",
      pricePoints: 0,
      rarity: "normal",
      isActive: true,
      sortOrder: 0,
    },
    update: {},
    select: { id: true },
  });

  const equippedAt = new Date();
  const equipped = await tx.studentProfile.updateMany({
    where: {
      userId,
      currentTitleId: null,
    },
    data: { currentTitleId: starterTitle.id },
  });

  await tx.userTitle.upsert({
    where: {
      userId_titleId: {
        userId,
        titleId: starterTitle.id,
      },
    },
    create: {
      userId,
      titleId: starterTitle.id,
      equippedAt: equipped.count > 0 ? equippedAt : null,
    },
    update:
      equipped.count > 0
        ? { equippedAt }
        : {},
  });
}
