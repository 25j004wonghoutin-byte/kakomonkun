import type { Prisma } from "../../../prisma/generated/client";

type BoardReplyNotificationValue = {
  postAuthorId: string;
  postAuthorStatus: string;
  postAuthorDeletedAt: Date | null;
  actorId: string;
  boardCommentId: string;
};

type BoardPinnedNotificationValue = {
  wasPinned: boolean;
  isPinned: boolean;
  actorId: string;
  boardPostId: string;
};

export function shouldNotifyBoardReply(
  postAuthorId: string,
  replyAuthorId: string,
) {
  return postAuthorId !== replyAuthorId;
}

export function shouldBroadcastPinnedPost(
  wasPinned: boolean,
  isPinned: boolean,
) {
  return !wasPinned && isPinned;
}

export async function createBoardReplyNotification(
  tx: Prisma.TransactionClient,
  value: BoardReplyNotificationValue,
) {
  if (
    !shouldNotifyBoardReply(value.postAuthorId, value.actorId) ||
    value.postAuthorStatus !== "active" ||
    value.postAuthorDeletedAt
  ) {
    return 0;
  }

  const created = await tx.notification.createMany({
    data: [
      {
        recipientId: value.postAuthorId,
        actorId: value.actorId,
        type: "board_reply",
        boardCommentId: value.boardCommentId,
      },
    ],
    skipDuplicates: true,
  });

  return created.count;
}

export async function createBoardPinnedNotifications(
  tx: Prisma.TransactionClient,
  value: BoardPinnedNotificationValue,
) {
  if (!shouldBroadcastPinnedPost(value.wasPinned, value.isPinned)) {
    return 0;
  }

  const students = await tx.user.findMany({
    where: {
      role: { name: "student" },
      status: "active",
      deletedAt: null,
    },
    select: { id: true },
  });
  const created = await tx.notification.createMany({
    data: students.map((student) => ({
      recipientId: student.id,
      actorId: value.actorId,
      type: "board_pinned",
      boardPostId: value.boardPostId,
    })),
    skipDuplicates: true,
  });

  return created.count;
}

export function notificationReadWhere(
  recipientId: string,
  notificationId: string,
) {
  return { id: notificationId, recipientId };
}

export function notificationReadResult(
  notificationExists: boolean,
): "changed" | "not_found" {
  return notificationExists ? "changed" : "not_found";
}

export async function markNotificationRead(
  recipientId: string,
  notificationId: string,
): Promise<"changed" | "not_found"> {
  const { prisma } = await import("../prisma");
  const where = notificationReadWhere(recipientId, notificationId);
  const existing = await prisma.notification.findFirst({
    where,
    select: { id: true },
  });

  if (!existing) {
    return notificationReadResult(false);
  }

  await prisma.notification.updateMany({
    where: { ...where, readAt: null },
    data: { readAt: new Date() },
  });

  return notificationReadResult(true);
}
