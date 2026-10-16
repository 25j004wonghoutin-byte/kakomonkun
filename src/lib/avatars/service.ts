import { AvatarError, createAvatarRef, parseAvatarUrl, type AvatarRef } from "./contract";
import type { AvatarRepository } from "./repository";
import type { AvatarStorage } from "./storage";

type Mutation = { userId: string; expectedAvatarUrl: string | null };
type Dependencies = {
  repository: AvatarRepository;
  storage: AvatarStorage;
  newVersion(): string;
  log(event: string, ref: AvatarRef): void;
};

export type AvatarService = ReturnType<typeof createAvatarService>;

export function createAvatarService({ repository, storage, newVersion, log }: Dependencies) {
  const unknown = () => new AvatarError("mutation_unknown", 503, "保存結果を確認できませんでした。現在のアイコンを確認してから再度操作してください。");
  function record(event: string, ref: AvatarRef) {
    try { log(event, ref); } catch { /* Diagnostics must not change a committed profile update. */ }
  }
  async function cleanup(ref: AvatarRef) {
    try {
      if (await repository.unreferencedAfterLock(ref)) await storage.remove(ref.key);
      else record("cleanup_deferred", ref);
    } catch { record("cleanup_deferred", ref); }
  }
  function confirmedFailure(result: "conflict" | "denied") {
    return result === "conflict"
      ? new AvatarError("avatar_conflict", 409, "別の操作でアイコンが更新されました。確認して再度操作してください。")
      : new AvatarError("avatar_denied", 403, "アイコンを変更できません。");
  }
  return {
    async save({ userId, expectedAvatarUrl, image }: Mutation & {image: Uint8Array}): Promise<{avatarUrl: string}> {
      const next = createAvatarRef(userId, newVersion());
      try { await storage.put(next.key, image); }
      catch { record("upload_unknown", next); throw unknown(); }
      let result;
      try { result = await repository.replace(userId, expectedAvatarUrl, next.url); }
      catch { record("commit_unknown", next); throw unknown(); }
      if (result !== "updated") { await cleanup(next); throw confirmedFailure(result); }
      const previous = parseAvatarUrl(expectedAvatarUrl);
      if (previous?.userId === userId) await cleanup(previous);
      return { avatarUrl: next.url };
    },
    async remove({ userId, expectedAvatarUrl }: Mutation): Promise<{avatarUrl: null}> {
      let result;
      try { result = await repository.replace(userId, expectedAvatarUrl, null); }
      catch { throw unknown(); }
      if (result !== "updated") throw confirmedFailure(result);
      const previous = parseAvatarUrl(expectedAvatarUrl);
      if (previous?.userId === userId) await cleanup(previous);
      return { avatarUrl: null };
    },
    async read(ref: AvatarRef): Promise<Uint8Array | null> {
      const current = await repository.current(ref.userId);
      if (!current?.activeStudent || current.avatarUrl !== ref.url) return null;
      return storage.get(ref.key);
    },
  };
}
