"use client";

import { useEffect, useState } from "react";
import { BOARD_RESTRICTED_MESSAGE, formatBoardDateTime } from "@/lib/board/moderation-contract";

export function useBoardRestriction(expiresAt: string | null) {
  const [elapsedExpiry, setElapsedExpiry] = useState<string | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const expiryTime = Date.parse(expiresAt);
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      const remaining = expiryTime - Date.now();
      if (remaining <= 0) {
        setElapsedExpiry(expiresAt);
        return;
      }
      timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    }
    checkExpiry();
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return expiresAt && elapsedExpiry !== expiresAt ? expiresAt : null;
}

export function BoardRestrictionNotice({ expiresAt }: { expiresAt: string }) {
  return (
    <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 sm:px-6">
      {BOARD_RESTRICTED_MESSAGE} 解除予定は<time dateTime={expiresAt}>{formatBoardDateTime(expiresAt)}</time>（日本時間）です。
    </p>
  );
}
