"use client";

import { useState, type ReactNode } from "react";
import { parseAvatarUrl } from "@/lib/avatars/contract";

export function StudentAvatar({ avatarUrl, displayName, size, className = "", fallback }: {
  avatarUrl: string | null; displayName: string; size: number; className?: string; fallback?: ReactNode;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = parseAvatarUrl(avatarUrl)?.url ?? null;
  return <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-blue-50 font-black text-blue-700 ${className}`} style={{ width: size, height: size }}>
    {url && failedUrl !== url ? (
      // eslint-disable-next-line @next/next/no-img-element -- Authenticated images must be requested directly with the browser session, without the shared optimizer.
      <img src={url} alt={`${displayName}のアイコン`} width={size} height={size} onError={() => setFailedUrl(url)} className="h-full w-full object-cover" />
    ) : fallback ?? (displayName.trim().charAt(0).toUpperCase() || "学")}
  </span>;
}
