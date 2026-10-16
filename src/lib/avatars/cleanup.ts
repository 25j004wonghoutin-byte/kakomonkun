import { parseAvatarKey, type AvatarRef } from "./contract";
import type { AvatarRepository } from "./repository";
import type { AvatarStorage } from "./storage";

type Dependencies = { storage: AvatarStorage; repository: AvatarRepository; now: Date };
const oldEnough = (createdAt: Date, now: Date) => Number.isFinite(createdAt.getTime()) && Number.isFinite(now.getTime()) && now.getTime() - createdAt.getTime() >= 24 * 60 * 60 * 1000;

export async function listAvatarCleanupCandidates({ storage, repository, now }: Dependencies): Promise<Array<{ref: AvatarRef; createdAt: Date}>> {
  const result = [];
  for await (const object of storage.list()) {
    const ref = parseAvatarKey(object.key);
    if (!ref || !oldEnough(object.createdAt, now)) continue;
    const owner = await repository.current(ref.userId);
    if (owner && owner.avatarUrl !== ref.url) result.push({ ref, createdAt: object.createdAt });
  }
  return result;
}

export async function cleanupAvatarObject({ ref, storage, repository, now }: Dependencies & {ref: AvatarRef}): Promise<"deleted" | "deferred" | "current"> {
  const parsed = parseAvatarKey(ref.key);
  if (!parsed || parsed.userId !== ref.userId || parsed.version !== ref.version || parsed.url !== ref.url) return "deferred";
  try {
    let found = false;
    for await (const object of storage.list()) {
      if (object.key !== ref.key) continue;
      if (!oldEnough(object.createdAt, now)) return "deferred";
      found = true; break;
    }
    if (!found) return "deferred";
    if (!await repository.unreferencedAfterLock(ref)) return "current";
    await storage.remove(ref.key);
    return "deleted";
  } catch { return "deferred"; }
}
