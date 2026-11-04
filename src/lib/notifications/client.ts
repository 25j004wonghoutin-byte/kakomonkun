import type { NotificationView } from "./contract";
import type { NotificationReadAllResult } from "./write";

export type NotificationPageResponse = {
  ownerId: string;
  notifications: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
};

type CountUpdate = { unreadCount: number; readAt?: string };
type Send = (url: string, options: RequestInit) => Promise<Response>;

export class NotificationOwnerChangedError extends Error {
  constructor() {
    super("Notification owner changed");
    this.name = "NotificationOwnerChangedError";
  }
}

export function applyNotificationReadCutoff(notifications: NotificationView[], readAt: string | null) {
  if (!readAt) return notifications;
  const cutoff = Date.parse(readAt);
  return notifications.map((notification) =>
    notification.readAt === null && Date.parse(notification.createdAt) <= cutoff
      ? { ...notification, readAt }
      : notification,
  );
}

function createOwnerScope(ownerId: string, send: Send) {
  let active = true;
  let revision = 0;
  let unreadCount: number | null = null;
  let readAt: string | null = null;
  let countRequest: { revision: number; promise: Promise<void> } | null = null;
  let pendingMutations = 0;
  let mutationTail: Promise<unknown> = Promise.resolve();
  const openings = new WeakMap<object, Promise<NotificationReadAllResult>>();
  const individualReads = new Map<string, string>();
  const listeners = new Set<(update: CountUpdate) => void>();
  const controller = new AbortController();

  function assertOwner() {
    if (!active) throw new NotificationOwnerChangedError();
  }
  function publish(update: CountUpdate) {
    assertOwner();
    unreadCount = update.unreadCount;
    for (const listener of listeners) listener(update);
  }
  async function json<T>(url: string, options: RequestInit = {}): Promise<T> {
    assertOwner();
    const response = await send(url, { cache: "no-store", signal: controller.signal, ...options });
    assertOwner();
    if (response.status === 401) throw new NotificationOwnerChangedError();
    if (!response.ok) throw new Error("Notification request failed");
    const data = await response.json();
    assertOwner();
    if (data.ownerId !== ownerId) throw new NotificationOwnerChangedError();
    return data as T;
  }
  function mutate<T>(operation: () => Promise<T>): Promise<T> {
    try { assertOwner(); } catch (error) { return Promise.reject(error); }
    const previous = mutationTail;
    const first = pendingMutations === 0;
    pendingMutations++;
    revision++;
    const run = async () => { assertOwner(); return operation(); };
    const promise = (first ? run() : previous.catch(() => {}).then(run))
      .finally(() => { pendingMutations--; });
    mutationTail = promise;
    return promise;
  }
  function refreshUnreadCount(): Promise<void> {
    try { assertOwner(); } catch (error) { return Promise.reject(error); }
    if (pendingMutations > 0) return mutationTail.then(() => undefined);
    if (countRequest?.revision === revision) return countRequest.promise;
    const started = revision;
    const promise = json<{ unreadCount: number }>("/api/notifications/unread-count")
      .then((data) => {
        if (started === revision) publish({ unreadCount: data.unreadCount });
      })
      .finally(() => {
        if (countRequest?.promise === promise) countRequest = null;
      });
    countRequest = { revision: started, promise };
    return promise;
  }
  function openInbox(opening: object): Promise<NotificationReadAllResult> {
    try { assertOwner(); } catch (error) { return Promise.reject(error); }
    const existing = openings.get(opening);
    if (existing) return existing;
    const promise = mutate(async () => {
      const result = await json<NotificationReadAllResult>("/api/notifications/read-all", { method: "PATCH" });
      revision++;
      readAt = result.readAt;
      publish({ unreadCount: result.unreadCount, readAt: result.readAt });
      return result;
    });
    openings.set(opening, promise);
    void promise.catch(() => { if (openings.get(opening) === promise) openings.delete(opening); });
    return promise;
  }
  async function loadPage(cursor: string | null = null): Promise<NotificationPageResponse> {
    const started = revision;
    const query = cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
    const page = await json<NotificationPageResponse>("/api/notifications" + query);
    // Every queued opening gets a fresh server cutoff before a stale page is exposed.
    while (pendingMutations > 0) { await mutationTail; assertOwner(); }
    assertOwner();
    if (started === revision) publish({ unreadCount: page.unreadCount });
    return {
      ...page,
      notifications: applyNotificationReadCutoff(page.notifications, readAt).map((notification) =>
        notification.readAt === null && individualReads.has(notification.id)
          ? { ...notification, readAt: individualReads.get(notification.id)! }
          : notification,
      ),
      unreadCount: unreadCount ?? page.unreadCount,
    };
  }
  function markRead(notificationId: string) {
    return mutate(async () => {
      await json("/api/notifications/" + encodeURIComponent(notificationId) + "/read", { method: "PATCH" });
      const timestamp = new Date().toISOString();
      individualReads.set(notificationId, timestamp);
      const count = await json<{ unreadCount: number }>("/api/notifications/unread-count");
      revision++;
      publish({ unreadCount: count.unreadCount });
      return timestamp;
    });
  }
  return {
    ownerId,
    isCurrent: () => active,
    deactivate() { active = false; controller.abort(); listeners.clear(); },
    openInbox,
    loadPage,
    markRead,
    refreshUnreadCount,
    subscribe(listener: (update: CountUpdate) => void) {
      assertOwner();
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function createNotificationClient(send: Send = (url, options) => fetch(url, options)) {
  let scope: ReturnType<typeof createOwnerScope> | null = null;
  return {
    setOwner(ownerId: string | null) {
      if (scope?.ownerId === ownerId) return scope;
      scope?.deactivate();
      scope = ownerId ? createOwnerScope(ownerId, send) : null;
      return scope;
    },
  };
}
export const notificationClient = createNotificationClient();
