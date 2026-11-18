import type { Prisma } from "../../../prisma/generated/client";
import type { BoardActor } from "./contract";

async function lockBoardStudent(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
}

export async function runBoardWriteInTransaction<T>(
  tx: Prisma.TransactionClient,
  actor: BoardActor,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
  now = () => new Date(),
): Promise<T | "restricted"> {
  if (actor.roleName === "student") {
    // Serialize with setting or releasing this student's restriction.
    await lockBoardStudent(tx, actor.id);
    const restriction = await tx.boardRestriction.findUnique({
      where: { userId: actor.id },
      select: { expiresAt: true },
    });
    if (restriction && restriction.expiresAt > now()) return "restricted";
  }
  return write(tx);
}

export async function runBoardWrite<T>(
  actor: BoardActor,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
  timeout?: number,
) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction((tx) => runBoardWriteInTransaction(tx, actor, write), { timeout });
}

export async function getBoardRestrictionExpiry(userId: string, roleName: string) {
  if (roleName !== "student") return null;
  const { prisma } = await import("@/lib/prisma");
  const restriction = await prisma.boardRestriction.findUnique({
    where: { userId },
    select: { expiresAt: true },
  });
  return restriction && restriction.expiresAt > new Date() ? restriction.expiresAt.toISOString() : null;
}

export async function setBoardRestriction(userId: string, expiresAt: Date | null) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction(async (tx) => {
    await lockBoardStudent(tx, userId);
    const student = await tx.user.findFirst({
      where: { id: userId, role: { name: "student" }, deletedAt: null },
      select: { id: true },
    });
    if (!student) return "not_found";

    if (!expiresAt) {
      await tx.boardRestriction.deleteMany({ where: { userId } });
      return "changed";
    }
    if (expiresAt <= new Date()) return "invalid_expiry";
    await tx.boardRestriction.upsert({
      where: { userId },
      update: { expiresAt },
      create: { userId, expiresAt },
    });
    return "changed";
  });
}
