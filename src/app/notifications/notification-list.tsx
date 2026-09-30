"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  notificationTarget,
  type NotificationView,
} from "@/lib/notifications/contract";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type NotificationPageResponse = {
  notifications: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
};

type NotificationListProps = {
  initialNotifications: NotificationView[];
  initialNextCursor: string | null;
  initialUnreadCount: number;
};

export function NotificationList({
  initialNotifications,
  initialNextCursor,
  initialUnreadCount,
}: NotificationListProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [activeNotificationId, setActiveNotificationId] = useState<
    string | null
  >(null);
  const [unavailableNotificationId, setUnavailableNotificationId] = useState<
    string | null
  >(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function selectNotification(notification: NotificationView) {
    if (activeNotificationId) return;

    setActiveNotificationId(notification.id);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/notifications/${notification.id}/read`,
        { method: "PATCH" },
      );
      if (!response.ok) {
        throw new Error("notification read failed");
      }

      if (!notification.readAt) {
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id
              ? { ...item, readAt: new Date().toISOString() }
              : item,
          ),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      }

      const target = notificationTarget(notification);
      if (!target || !notification.targetAvailable) {
        setUnavailableNotificationId(notification.id);
        return;
      }

      router.push(target);
    } catch {
      setErrorMessage(
        "通知を開けませんでした。時間をおいてもう一度お試しください。",
      );
    } finally {
      setActiveNotificationId(null);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/notifications?cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (!response.ok) {
        throw new Error("notification loading failed");
      }

      const data = (await response.json()) as NotificationPageResponse;
      setNotifications((current) => [...current, ...data.notifications]);
      setNextCursor(data.nextCursor);
      setUnreadCount(data.unreadCount);
    } catch {
      setErrorMessage(
        "通知を読み込めませんでした。時間をおいてもう一度お試しください。",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <NotificationListView
      notifications={notifications}
      unreadCount={unreadCount}
      activeNotificationId={activeNotificationId}
      unavailableNotificationId={unavailableNotificationId}
      onSelect={selectNotification}
      nextCursor={nextCursor}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
      errorMessage={errorMessage}
    />
  );
}

export function NotificationListView({
  notifications,
  unreadCount,
  activeNotificationId,
  unavailableNotificationId,
  onSelect,
  nextCursor = null,
  loadingMore = false,
  onLoadMore,
  errorMessage = null,
}: {
  notifications: NotificationView[];
  unreadCount: number;
  activeNotificationId: string | null;
  unavailableNotificationId: string | null;
  onSelect: (notification: NotificationView) => void;
  nextCursor?: string | null;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  errorMessage?: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 px-5 py-3 sm:px-6">
        <strong className="text-sm font-black text-slate-950">すべての通知</strong>
        <span className="text-xs font-bold text-slate-500">未読 {unreadCount}件</span>
      </div>

      {errorMessage ? (
        <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-700 sm:px-6">
          {errorMessage}
        </p>
      ) : null}

      {notifications.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm font-bold text-slate-500">
          通知はまだありません。
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {notifications.map((notification) => {
            const unread = notification.readAt === null;
            const teacherNotification =
              notification.actorName === "管理者" ||
              notification.type === "board_pinned";
            const unavailable =
              unavailableNotificationId === notification.id;

            return (
              <li key={notification.id}>
                <button
                  type="button"
                  disabled={activeNotificationId === notification.id}
                  onClick={() => onSelect(notification)}
                  className={`block min-h-24 w-full px-5 py-4 text-left transition hover:bg-slate-50 disabled:cursor-wait sm:px-6 ${
                    unread ? "bg-blue-50" : "bg-white"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <span className="mt-1 grid size-3 shrink-0 place-items-center">
                      {unread ? (
                        <span
                          aria-label="未読"
                          className="size-2 rounded-full bg-blue-600"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <span
                          className={`break-words text-sm leading-6 ${
                            teacherNotification
                              ? "font-black text-violet-800"
                              : "font-bold text-slate-950"
                          }`}
                        >
                          {notification.message}
                        </span>
                        <time className="shrink-0 text-[11px] font-bold text-slate-400">
                          {dateTimeFormatter.format(
                            new Date(notification.createdAt),
                          )}
                        </time>
                      </span>
                      {unavailable ? (
                        <span className="mt-2 block text-xs font-bold text-rose-700">
                          対象の投稿は削除されています。
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <div className="border-t border-slate-200 p-4 text-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore ? "読み込み中…" : "さらに読み込む"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
