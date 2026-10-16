import type { Prisma, PrismaClient } from "../../../prisma/generated/client";
import { AvatarError, type AvatarRef, parseAvatarUrl } from "./contract";

export type AvatarRepository = {
  current(userId: string): Promise<{avatarUrl: string | null; activeStudent: boolean} | null>;
  replace(userId: string, expected: string | null, next: string | null): Promise<"updated" | "conflict" | "denied">;
  unreferencedAfterLock(ref: AvatarRef): Promise<boolean>;
};

const selection = {
  status: true, deletedAt: true, role: { select: { name: true } },
  studentProfile: { select: { avatarUrl: true } },
} as const;

async function lockOwner(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${userId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT user_id FROM public.student_profiles WHERE user_id = ${userId}::uuid FOR UPDATE`;
  return tx.user.findUnique({ where: { id: userId }, select: selection });
}

export function createAvatarRepository(db: PrismaClient): AvatarRepository {
  const options = { maxWait: 10_000, timeout: 15_000 };
  return {
    async current(userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: selection });
      if (!user) return null;
      return {
        avatarUrl: user.studentProfile?.avatarUrl ?? null,
        activeStudent: user.role.name === "student" && user.status === "active" && !user.deletedAt && !!user.studentProfile,
      };
    },
    async replace(userId, expected, next) {
      if (next !== null && parseAvatarUrl(next)?.userId !== userId) {
        throw new AvatarError("invalid_reference", 400, "画像の指定が正しくありません。");
      }
      return db.$transaction(async tx => {
        const user = await lockOwner(tx, userId);
        if (!user || user.role.name !== "student" || user.status !== "active" || user.deletedAt || !user.studentProfile) return "denied";
        const current = user.studentProfile.avatarUrl;
        if (next === null && current === null) return "updated";
        if (current !== expected) return "conflict";
        await tx.studentProfile.update({ where: { userId }, data: { avatarUrl: next } });
        return "updated";
      }, options);
    },
    async unreferencedAfterLock(ref) {
      return db.$transaction(async tx => {
        const user = await lockOwner(tx, ref.userId);
        return !!user && user.role.name === "student" && !!user.studentProfile && user.studentProfile.avatarUrl !== ref.url;
      }, options);
    },
  };
}
