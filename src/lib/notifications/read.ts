import type { Prisma } from "../../../prisma/generated/client";
import {
  notificationMessage,
  type NotificationType,
  type NotificationView,
} from "@/lib/notifications/contract";
import {
  encodeNotificationCursor,
  parseNotificationCursor,
  type NotificationCursor,
} from "@/lib/notifications/cursor";
import { displayNameForRole } from "@/lib/teacher/identity";

const NOTIFICATION_PAGE_SIZE = 20;

const notificationSelect = {
  id: true,
  type: true,
  readAt: true,
  createdAt: true,
  actor: {
    select: {
      displayName: true,
      role: { select: { name: true } },
    },
  },
  boardPost: { select: { id: true, deletedAt: true } },
  boardComment: {
    select: {
      post: { select: { id: true, deletedAt: true } },
    },
  },
} as const;

type NotificationRow = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export class InvalidNotificationCursorError extends Error {
  constructor() {
    super("Invalid notification cursor");
    this.name = "InvalidNotificationCursorError";
  }
}

export function toNotificationView(row: NotificationRow): NotificationView {
  const type = toNotificationType(row.type);
  const actorName = row.actor
    ? displayNameForRole(row.actor.role.name, row.actor.displayName)
    : null;
  const postId = notificationPostId(type, row);

  return {
    id: row.id,
    type,
    actorName,
    message: notificationMessage({ type, actorName }),
    postId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    targetAvailable: type === "title_unlocked" || postId !== null,
  };
}

export async function listNotifications(
  recipientId: string,
  cursorText: string | null,
): Promise<{ notifications: NotificationView[]; nextCursor: string | null }> {
  const cursor = parseCursor(cursorText);
  const { prisma } = await import("../prisma");
  const rows = await prisma.notification.findMany({
    where: {
      recipientId,
      ...notificationCursorWhere(cursor),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: NOTIFICATION_PAGE_SIZE + 1,
    select: notificationSelect,
  });
  const hasMore = rows.length > NOTIFICATION_PAGE_SIZE;
  const pageRows = rows.slice(0, NOTIFICATION_PAGE_SIZE);

  return {
    notifications: pageRows.map(toNotificationView),
    nextCursor: notificationNextCursor(pageRows, hasMore),
  };
}

export async function getUnreadNotificationCount(recipientId: string) {
  const { prisma } = await import("../prisma");
  return prisma.notification.count({
    where: { recipientId, readAt: null },
  });
}

function parseCursor(cursorText: string | null) {
  if (cursorText === null) return null;

  const cursor = parseNotificationCursor(cursorText);
  if (!cursor) {
    throw new InvalidNotificationCursorError();
  }

  return cursor;
}

function notificationCursorWhere(
  cursor: NotificationCursor | null,
): Prisma.NotificationWhereInput {
  if (!cursor) return {};

  const createdAt = new Date(cursor.createdAt);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: cursor.id } },
    ],
  };
}

function notificationNextCursor(
  rows: NotificationRow[],
  hasMore: boolean,
) {
  const last = rows.at(-1);
  if (!hasMore || !last) return null;

  return encodeNotificationCursor({
    createdAt: last.createdAt.toISOString(),
    id: last.id,
  });
}

function notificationPostId(
  type: NotificationType,
  row: Pick<NotificationRow, "boardPost" | "boardComment">,
) {
  const post =
    type === "board_reply"
      ? row.boardComment?.post
      : type === "board_pinned"
        ? row.boardPost
        : null;

  return post && !post.deletedAt ? post.id : null;
}

function toNotificationType(value: string): NotificationType {
  if (
    value === "board_reply" ||
    value === "board_pinned" ||
    value === "title_unlocked"
  ) {
    return value;
  }

  throw new Error(`Unsupported notification type: ${value}`);
}
