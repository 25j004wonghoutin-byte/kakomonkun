export const AVATAR_BUCKET = "student-avatars";
export const AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_SOURCE_BYTES = 5 * 1024 * 1024;
export const AVATAR_BODY_BYTES = AVATAR_BYTES + 64 * 1024;
export const AVATAR_SIZE = 512;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type AvatarRef = { userId: string; version: string; key: string; url: string };

export class AvatarError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "AvatarError";
  }
}

export function createAvatarRef(userId: string, version: string): AvatarRef {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(version)) {
    throw new AvatarError("invalid_reference", 400, "画像の指定が正しくありません。");
  }
  return { userId, version, key: `${userId}/${version}.webp`, url: `/api/avatars/${userId}/${version}` };
}

export function parseAvatarUrl(value: unknown): AvatarRef | null {
  if (typeof value !== "string") return null;
  const parts = value.split("/");
  if (parts.length !== 5 || parts[0] !== "" || parts[1] !== "api" || parts[2] !== "avatars"
    || !UUID_PATTERN.test(parts[3]) || !UUID_PATTERN.test(parts[4])) return null;
  return createAvatarRef(parts[3], parts[4]);
}

export function parseAvatarKey(value: string): AvatarRef | null {
  const parts = value.split("/");
  if (parts.length !== 2 || !parts[1].endsWith(".webp")) return null;
  return parseAvatarUrl(`/api/avatars/${parts[0]}/${parts[1].slice(0, -5)}`);
}
