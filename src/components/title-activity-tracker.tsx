"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { createTitleActivityClient, createTitleTabClaim } from "@/lib/titles/activity-client";
import { getTokyoDate } from "@/lib/tokyo-date";

let activityClient: ReturnType<typeof createTitleActivityClient> | null = null;

export function TitleActivityTracker() {
  const pathname = usePathname();
  useEffect(() => {
    // Module単位で共有し、StrictModeや画面再mountで同じタブを作り直さない。
    if (!activityClient) {
      const fallbackStorage = { getItem: () => null, setItem: () => undefined };
      let storage: Pick<Storage, "getItem" | "setItem"> = fallbackStorage;
      try { storage = window.sessionStorage; } catch { /* private mode */ }
      activityClient = createTitleActivityClient({
        storage,
        // Web Locks未対応ではdocumentごとに新しいIDを使い、別タブの合成を防ぐ。
        reuseSavedState: Boolean(navigator.locks),
        claimTabId: navigator.locks ? createTitleTabClaim(navigator.locks) : undefined,
        uuid: () => crypto.randomUUID(),
        isVisible: () => document.visibilityState === "visible",
        date: () => getTokyoDate(),
        send: async (body) => {
          const response = await fetch("/api/titles/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (!response.ok) throw new Error("Activity could not be recorded");
          return response.json() as Promise<{ date: string }>;
        },
      });
    }
    const client = activityClient;
    void client.visit(pathname, true);
    const onVisibility = () => { if (document.visibilityState === "visible") void client.visit(pathname, true); };
    const onInput = (event: Event) => { if (event.isTrusted) void client.input(pathname); };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onInput, { passive: true });
    document.addEventListener("keydown", onInput);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onInput);
      document.removeEventListener("keydown", onInput);
    };
  }, [pathname]);
  return null;
}
