import { AvatarError } from "./contract";

export type AvatarStorageConfig = { url: string; secret: string };

export function getAvatarStorageConfig(env: Record<string, string | undefined>): AvatarStorageConfig {
  const unavailable = () => new AvatarError("storage_configuration", 503, "画像保存の設定を確認中です。しばらくしてから再度お試しください。");
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const match = url?.match(/^https:\/\/([a-z]{20})\.supabase\.co$/);
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !match || !secret || /\s/.test(secret)) throw unavailable();
  if (!/^sb_secret_[a-zA-Z0-9_-]+$/.test(secret)) {
    try {
      const parts = secret.split(".");
      if (parts.length !== 3) throw unavailable();
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (payload.role !== "service_role" || payload.ref !== match[1]) throw unavailable();
    } catch { throw unavailable(); }
  }
  return { url, secret };
}
