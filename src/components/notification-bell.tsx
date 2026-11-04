"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { notificationClient, NotificationOwnerChangedError } from "@/lib/notifications/client";

type NotificationBellProps = {
  ownerId?: string | null;
  href?: string;
  enabled?: boolean;
};

export function NotificationBell({ ownerId = null, href = "/notifications", enabled = true }: NotificationBellProps) {
  const pathname = usePathname();
  const [count, setCount] = useState<{ ownerId: string | null; value: number }>({ ownerId: null, value: 0 });
  const unreadCount = enabled && count.ownerId === ownerId ? count.value : 0;

  useEffect(() => {
    const scope = notificationClient.setOwner(enabled ? ownerId : null);
    if (!scope) return;
    const unsubscribe = scope.subscribe((update) => {
      setCount({ ownerId, value: update.unreadCount });
    });
    void scope.refreshUnreadCount().catch((error) => {
      if (error instanceof NotificationOwnerChangedError && scope.isCurrent()) {
        setCount({ ownerId: null, value: 0 });
        window.location.reload();
      }
    });
    return unsubscribe;
  }, [pathname, enabled, ownerId]);

  const badge = formatUnreadBadge(unreadCount);

  return (
    <Link
      href={href}
      aria-label={unreadCount > 0 ? `通知 未読${unreadCount}件` : "通知"}
      className="relative grid size-10 place-items-center rounded-full text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
        <path
          d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8.5C3 17.33 3.67 18 4.5 18h15c.83 0 1.5-.67 1.5-1.5C21 15 18 15 18 8ZM9.75 21h4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {badge ? (
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-xs font-black leading-5 text-white ring-2 ring-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function formatUnreadBadge(count: number) {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
