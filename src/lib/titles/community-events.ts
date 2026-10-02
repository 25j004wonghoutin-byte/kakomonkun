import type { Prisma } from "../../../prisma/generated/client";
import { recordTitleActivity } from "./activity";
import { LearningEventError } from "./learning-events";
import { lockTitleOwner, syncTitleUnlocks } from "./unlocks";

export async function updateStudentProfile(tx: Prisma.TransactionClient, userId: string, displayName: string, bio: string | null, now: Date) {
  await lockTitleOwner(tx, userId);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { displayName: true, role: { select: { name: true } } } });
  if (user?.role.name !== "student") throw new LearningEventError(403, "Forbidden");
  const normalizedName = displayName.trim();
  const displayNameChanged = user.displayName.trim() !== normalizedName;
  const updatedUser = await tx.user.update({ where: { id: userId }, data: { displayName: normalizedName }, select: { displayName: true } });
  const updatedProfile = await tx.studentProfile.update({ where: { userId }, data: { bio: bio?.trim() || null }, select: { bio: true } });
  await recordTitleActivity(tx, userId, { now });
  if (displayNameChanged) await syncTitleUnlocks(tx, userId, { now, source: "event", displayNameChanged: true });
  return { displayName: updatedUser.displayName, bio: updatedProfile.bio };
}
