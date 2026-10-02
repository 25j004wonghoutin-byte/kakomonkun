import type { Prisma, PrismaClient } from "../../../prisma/generated/client";
import { createTitleUnlockNotifications } from "../notifications/write";
import { TITLE_CATALOG } from "./catalog";
import type { UnlockContext, UnlockSummary } from "./contract";
import { collectTitleFacts } from "./facts";
import { evaluateTitleRules } from "./rules";

export async function lockTitleOwner(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${userId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT user_id FROM public.student_profiles WHERE user_id = ${userId}::uuid FOR UPDATE`;
}

async function isActiveStudent(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true, deletedAt: true, role: { select: { name: true } } } });
  return user?.role.name === "student" && user.status === "active" && user.deletedAt === null;
}

/** 呼び出し元の保存と同じtransactionを使い、永久資格と通知も同時に確定する。 */
export async function syncTitleUnlocks(
  tx: Prisma.TransactionClient,
  userId: string,
  context: UnlockContext,
): Promise<UnlockSummary> {
  await lockTitleOwner(tx, userId);
  if (!await isActiveStudent(tx, userId)) return { newlyUnlockedKeys: [] };
  const facts = await collectTitleFacts(tx, userId, context.now);
  facts.nameChanged = context.displayNameChanged === true;
  const eligible = evaluateTitleRules(facts, TITLE_CATALOG);
  if (eligible.length === 0) return { newlyUnlockedKeys: [] };
  const [titles, existing, owned] = await Promise.all([
    tx.title.findMany({ where: { catalogKey: { in: eligible }, isActive: true }, select: { id: true, catalogKey: true } }),
    tx.userTitleUnlock.findMany({ where: { userId }, select: { titleId: true } }),
    tx.userTitle.findMany({ where: { userId }, select: { titleId: true } }),
  ]);
  const existingIds = new Set(existing.map((item) => item.titleId));
  const candidates = titles.filter((title) => !existingIds.has(title.id));
  if (candidates.length === 0) return { newlyUnlockedKeys: [] };
  const inserted = await tx.userTitleUnlock.createManyAndReturn({
    data: candidates.map((title) => ({ userId, titleId: title.id, unlockedAt: context.now, source: context.source })),
    skipDuplicates: true,
    select: { titleId: true },
  });
  const insertedIds = new Set(inserted.map((item) => item.titleId));
  const ownedIds = new Set(owned.map((item) => item.titleId));
  await createTitleUnlockNotifications(tx, userId, inserted.filter((item) => !ownedIds.has(item.titleId)).map((item) => item.titleId));
  return { newlyUnlockedKeys: candidates.flatMap((title) => insertedIds.has(title.id) && title.catalogKey ? [title.catalogKey] : []) };
}

export async function backfillTitleUnlocks(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<UnlockSummary> {
  return prisma.$transaction(async (tx) => {
    await lockTitleOwner(tx, userId);
    if (!await isActiveStudent(tx, userId)) return { newlyUnlockedKeys: [] };
    const profile = await tx.studentProfile.findUnique({ where: { userId }, select: { titleBackfilledAt: true, titleTrackingStartedAt: true } });
    if (!profile || profile.titleBackfilledAt !== null) return { newlyUnlockedKeys: [] };
    if (profile.titleTrackingStartedAt === null) {
      await tx.studentProfile.update({ where: { userId }, data: { titleTrackingStartedAt: now } });
    }
    const summary = await syncTitleUnlocks(tx, userId, { now, source: "backfill" });
    await tx.studentProfile.update({ where: { userId }, data: { titleBackfilledAt: now } });
    return summary;
  }, { timeout: 30_000 });
}
