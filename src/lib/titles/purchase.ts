import type { Prisma } from "../../../prisma/generated/client";
import { getTokyoDate } from "../tokyo-date";
import { TITLE_CATALOG } from "./catalog";
import { lockTitleOwner, syncTitleUnlocks } from "./unlocks";

export class TitlePurchaseError extends Error {
  constructor(public readonly code: "unavailable" | "locked" | "owned" | "insufficient") { super(code); }
}

export async function purchaseTitle(
  tx: Prisma.TransactionClient, userId: string, titleId: string, now: Date,
): Promise<{ title: { id: string; name: string }; totalPoints: number; purchasedAt: Date }> {
  await lockTitleOwner(tx, userId);
  await tx.$queryRaw`SELECT id FROM public.titles WHERE id = ${titleId}::uuid FOR UPDATE`;
  const title = await tx.title.findUnique({ where: { id: titleId }, select: { id: true, name: true, catalogKey: true, acquisitionKind: true, pricePoints: true, isActive: true } });
  const definition = TITLE_CATALOG.find((item) => item.key === title?.catalogKey);
  if (!title?.isActive || !definition?.implemented || definition.acquisitionKind === "starter" || title.acquisitionKind !== definition.acquisitionKind || (title.acquisitionKind === "condition" ? title.pricePoints !== 0 : title.pricePoints <= 0)) throw new TitlePurchaseError("unavailable");
  const key = { userId, titleId };
  if (await tx.userTitle.findUnique({ where: { userId_titleId: key }, select: { id: true } })) throw new TitlePurchaseError("owned");
  if (title.acquisitionKind === "condition" && !await tx.userTitleUnlock.findUnique({ where: { userId_titleId: key }, select: { titleId: true } })) throw new TitlePurchaseError("locked");
  const profile = await tx.studentProfile.findUnique({ where: { userId }, select: { totalPoints: true } });
  if (!profile) throw new TitlePurchaseError("unavailable");
  if (title.pricePoints > 0) {
    const updated = await tx.studentProfile.updateMany({ where: { userId, totalPoints: { gte: title.pricePoints } }, data: { totalPoints: { decrement: title.pricePoints } } });
    if (updated.count !== 1) throw new TitlePurchaseError("insufficient");
  }
  const owned = await tx.userTitle.create({ data: { ...key, purchasedAt: now }, select: { purchasedAt: true } });
  if (title.pricePoints > 0) await tx.pointTransaction.create({ data: {
    userId, points: -title.pricePoints, reason: "title_purchase", sourceType: "title", sourceId: titleId,
    transactionDate: new Date(`${getTokyoDate(now)}T00:00:00.000Z`), description: `称号「${title.name}」を購入`,
  } });
  await syncTitleUnlocks(tx, userId, { now, source: "event" });
  const balance = await tx.studentProfile.findUniqueOrThrow({ where: { userId }, select: { totalPoints: true } });
  return { title: { id: title.id, name: title.name }, totalPoints: balance.totalPoints, purchasedAt: owned.purchasedAt };
}
