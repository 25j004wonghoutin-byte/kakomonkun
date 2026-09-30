"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NotificationBellProps = {
  href?: string;
};

export function NotificationBell({ href = "/notifications" }: NotificationBellProps) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUnreadCount() {
      try {
        const response = await fetch("/api/notifications/unread-count", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const data = (await response.json()) as { unreadCount: number };
        setUnreadCount(data.unreadCount);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    void loadUnreadCount();
    return () => controller.abort();
  }, [pathname]);

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
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-5 text-white ring-2 ring-white">
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
