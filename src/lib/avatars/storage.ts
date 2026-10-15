import { createClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET, AVATAR_BYTES, AvatarError, UUID_PATTERN, parseAvatarKey } from "./contract";
import type { AvatarStorageConfig } from "./storage-config";

export type AvatarObject = { key: string; createdAt: Date };
export type AvatarStorage = {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
  list(): AsyncIterable<AvatarObject>;
};

export function createAvatarStorage(config: AvatarStorageConfig, fetcher: typeof fetch = fetch): AvatarStorage {
  if (typeof window !== "undefined") throw new Error("Avatar storage is server-only");
  const client = createClient(config.url, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetcher(input, {
      ...init, cache: "no-store",
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    }) },
  }).storage.from(AVATAR_BUCKET);
  const unavailable = () => new AvatarError("storage_unavailable", 503, "画像を保存・取得できませんでした。時間をおいてお試しください。");
  function check(key: string) {
    if (!parseAvatarKey(key)) throw new AvatarError("invalid_reference", 400, "画像の指定が正しくありません。");
  }
  async function* entries(prefix: string) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw unavailable();
      yield* data;
      if (data.length < 100) return;
    }
  }
  return {
    async put(key, bytes) {
      check(key);
      if (!bytes.byteLength || bytes.byteLength > AVATAR_BYTES) throw new AvatarError("image_size", 413, "画像の容量が上限を超えています。");
      const { error } = await client.upload(key, bytes, { contentType: "image/webp", upsert: false, cacheControl: "0" });
      if (error) throw unavailable();
    },
    async get(key) {
      check(key);
      const { data, error } = await client.download(key);
      if (error) {
        if ("statusCode" in error && String(error.statusCode) === "404") return null;
        throw unavailable();
      }
      if (!data || !data.size || data.size > AVATAR_BYTES) throw unavailable();
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(key) {
      check(key);
      const { error } = await client.remove([key]);
      if (error) throw unavailable();
    },
    async *list() {
      for await (const owner of entries("")) {
        if (owner.id || !UUID_PATTERN.test(owner.name)) continue;
        for await (const object of entries(owner.name)) {
          if (!object.created_at) continue;
          const key = `${owner.name}/${object.name}`;
          const createdAt = new Date(object.created_at);
          if (object.id && parseAvatarKey(key) && Number.isFinite(createdAt.getTime())) yield { key, createdAt };
        }
      }
    },
  };
}
