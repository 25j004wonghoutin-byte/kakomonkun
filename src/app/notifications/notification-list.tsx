"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  notificationTarget,
  type NotificationView,
} from "@/lib/notifications/contract";
import {
  applyNotificationReadCutoff,
  notificationClient,
  NotificationOwnerChangedError,
} from "@/lib/notifications/client";
import { useRememberedStudentIdentity } from "@/components/student-identity-provider";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type NotificationListProps = {
  ownerId: string;
  initialNotifications: NotificationView[];
  initialNextCursor: string | null;
  initialUnreadCount: number;
};

export function NotificationList(props: NotificationListProps) {
  const router = useRouter();
  const { identity, signedOut } = useRememberedStudentIdentity();
  const currentOwnerId = signedOut ? null : identity?.id ?? props.ownerId;
  const ownerChanged = currentOwnerId !== props.ownerId;
  useEffect(() => {
    if (!ownerChanged) return;
    notificationClient.setOwner(currentOwnerId);
    router.refresh();
  }, [currentOwnerId, ownerChanged, router]);
  if (ownerChanged) return <p role="status">ログイン情報を確認しています…</p>;
  return <OwnedNotificationList key={props.ownerId} {...props} />;
}

export function OwnedNotificationList({
  ownerId,
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
  const [inboxErrorMessage, setInboxErrorMessage] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(true);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [ownerInvalid, setOwnerInvalid] = useState(false);
  const opening = useRef({});
  const activeRef = useRef(false);
  const scopeRef = useRef<ReturnType<typeof notificationClient.setOwner>>(null);

  useEffect(() => {
    let active = true;
    activeRef.current = true;
    const scope = notificationClient.setOwner(ownerId)!;
    scopeRef.current = scope;
    let restoreRequest = 0;
    const unsubscribe = scope.subscribe((update) => {
      if (!active) return;
      setUnreadCount(update.unreadCount);
      if (update.readAt) {
        setNotifications((current) => applyNotificationReadCutoff(current, update.readAt ?? null));
      }
    });

    async function restoreInbox(token = opening.current) {
      const request = ++restoreRequest;
      let marked = false;
      setMarkingRead(true);
      setErrorMessage(null);
      setInboxErrorMessage(null);
      try {
        // Only an actual mounted inbox writes; server rendering and prefetch do not.
        await scope.openInbox(token);
        if (!active || request !== restoreRequest) return;
        marked = true;
        const data = await scope.loadPage();
        if (!active || request !== restoreRequest) return;
        setNotifications(data.notifications);
        setNextCursor(data.nextCursor);
        setUnreadCount(data.unreadCount);
      } catch (error) {
        if (active && request === restoreRequest) {
          if (error instanceof NotificationOwnerChangedError) {
            setOwnerInvalid(true);
            router.refresh();
            return;
          }
          setInboxErrorMessage(marked
            ? "最新の通知を確認できませんでした。もう一度お試しください。"
            : "通知を既読にできませんでした。もう一度お試しください。");
        }
      } finally {
        if (active && request === restoreRequest) setMarkingRead(false);
      }
    }

    function restoreFromHistory(event: PageTransitionEvent) {
      if (event.persisted) void restoreInbox({});
    }
    // 再マウントとbfcache復元で、開いた時点の未読をまとめて既読にする。
    void restoreInbox();
    window.addEventListener("pageshow", restoreFromHistory);
    return () => {
      active = false;
      activeRef.current = false;
      unsubscribe();
      window.removeEventListener("pageshow", restoreFromHistory);
    };
  }, [ownerId, retryAttempt, router]);

  async function selectNotification(notification: NotificationView) {
    const scope = scopeRef.current;
    if (markingRead || activeNotificationId || !scope?.isCurrent()) return;

    setActiveNotificationId(notification.id);
    setErrorMessage(null);

    try {
      const readAt = await scope.markRead(notification.id);
      if (!activeRef.current || !scope.isCurrent()) return;

      if (!notification.readAt) {
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id
              ? { ...item, readAt }
              : item,
          ),
        );
      }

      const target = notificationTarget(notification);
      if (!target || !notification.targetAvailable) {
        setUnavailableNotificationId(notification.id);
        return;
      }

      // 戻る操作でも更新前の未読一覧を復元しない。
      router.refresh();
      router.push(target);
    } catch (error) {
      if (!activeRef.current || !scope.isCurrent()) return;
      if (error instanceof NotificationOwnerChangedError) {
        setOwnerInvalid(true);
        router.refresh();
        return;
      }
      setErrorMessage(
        "通知を開けませんでした。時間をおいてもう一度お試しください。",
      );
    } finally {
      setActiveNotificationId(null);
    }
  }

  async function loadMore() {
    const scope = scopeRef.current;
    if (!nextCursor || loadingMore || markingRead || !scope?.isCurrent()) return;

    setLoadingMore(true);
    setErrorMessage(null);

    try {
      const data = await scope.loadPage(nextCursor);
      if (!activeRef.current || !scope.isCurrent()) return;
      setNotifications((current) => [...current, ...data.notifications]);
      setNextCursor(data.nextCursor);
      setUnreadCount(data.unreadCount);
    } catch (error) {
      if (!activeRef.current || !scope.isCurrent()) return;
      if (error instanceof NotificationOwnerChangedError) {
        setOwnerInvalid(true);
        router.refresh();
        return;
      }
      setErrorMessage(
        "通知を読み込めませんでした。時間をおいてもう一度お試しください。",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  if (ownerInvalid) return <p role="status">ログイン情報を確認しています…</p>;

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
      errorMessage={inboxErrorMessage ?? errorMessage}
      markingRead={markingRead}
      onRetry={() => setRetryAttempt((current) => current + 1)}
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
  markingRead = false,
  onRetry,
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
  markingRead?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 px-5 py-3 sm:px-6">
        <strong className="text-sm font-black text-slate-950">すべての通知</strong>
        <span className="text-xs font-bold text-slate-500">未読 {unreadCount}件</span>
      </div>

      {errorMessage ? (
        <div role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-700 sm:px-6">
          <p>{errorMessage}</p>
          {onRetry ? (
            <button type="button" disabled={markingRead} onClick={onRetry} className="mt-2 min-h-11 rounded-lg border border-rose-300 bg-white px-4 font-black disabled:opacity-60">
              再試行
            </button>
          ) : null}
        </div>
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
                  disabled={markingRead || activeNotificationId === notification.id}
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
                              ? "font-black text-blue-800"
                              : "font-bold text-slate-950"
                          }`}
                        >
                          {notification.message}
                        </span>
                        <time className="shrink-0 text-xs font-bold text-slate-400">
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
            disabled={loadingMore || markingRead}
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
