import type { Prisma } from "../../../prisma/generated/client";
import type { BoardActor } from "@/lib/board/contract";
import {
  canDeleteContent,
  canPinPost,
} from "@/lib/board/permissions";
import { createBoardPinnedNotifications } from "@/lib/notifications/write";
import { recordTitleActivity } from "@/lib/titles/activity";
import { lockTitleOwner } from "@/lib/titles/unlocks";

export type BoardPostMutationResult =
  | "changed"
  | "not_found"
  | "forbidden";

export async function createBoardPost(actor: BoardActor, body: string) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction((tx) => createBoardPostInTransaction(tx, actor, body), { timeout: 30_000 });
}

export async function createBoardPostInTransaction(tx: Prisma.TransactionClient, actor: BoardActor, body: string, now = new Date()) {
  if (actor.roleName === "student") await lockTitleOwner(tx, actor.id);
  const created = await tx.boardPost.create({
    data: { authorId: actor.id, body },
    select: { id: true, isPinned: true },
  });
  if (actor.roleName === "student") await recordTitleActivity(tx, actor.id, { now });
  return created;
}

export async function setBoardPostPin(
  actor: BoardActor,
  postId: string,
  isPinned: boolean,
): Promise<BoardPostMutationResult> {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction((tx) =>
    setBoardPostPinInTransaction(tx, actor, postId, isPinned),
  );
}

export async function setBoardPostPinInTransaction(
  tx: Prisma.TransactionClient,
  actor: BoardActor,
  postId: string,
  isPinned: boolean,
): Promise<BoardPostMutationResult> {
  const post = await tx.boardPost.findUnique({
    where: { id: postId },
    select: {
      isPinned: true,
      deletedAt: true,
      author: { select: { role: { select: { name: true } } } },
    },
  });

  if (!post || post.deletedAt) {
    return "not_found";
  }
  if (!canPinPost(actor, post.author.role.name)) {
    return "forbidden";
  }

  const changed = await tx.boardPost.updateMany({
    where: { id: postId, deletedAt: null },
    data: { isPinned },
  });
  if (changed.count !== 1) {
    return "not_found";
  }

  await createBoardPinnedNotifications(tx, {
    wasPinned: post.isPinned,
    isPinned,
    actorId: actor.id,
    boardPostId: postId,
  });

  return "changed";
}

export async function deleteBoardPost(
  actor: BoardActor,
  postId: string,
  reason?: string,
): Promise<BoardPostMutationResult> {
  const { prisma } = await import("@/lib/prisma");
  const deletionReason =
    actor.roleName === "teacher" && reason
      ? reason.trim().slice(0, 200) || undefined
      : undefined;

  return prisma.$transaction(async (tx) => {
    const post = await tx.boardPost.findUnique({
      where: { id: postId },
      select: { authorId: true, deletedAt: true },
    });

    if (!post || post.deletedAt) {
      return "not_found";
    }
    if (!canDeleteContent(actor, post.authorId)) {
      return "forbidden";
    }

    const changed = await tx.boardPost.updateMany({
      where: { id: postId, deletedAt: null },
      data: { deletedAt: new Date(), isPinned: false },
    });
    if (changed.count !== 1) {
      return "not_found";
    }

    if (actor.roleName === "teacher") {
      await tx.boardDeleteLog.create({
        data: {
          targetType: "post",
          targetId: postId,
          deletedById: actor.id,
          reason: deletionReason,
        },
      });
    }

    return "changed";
  });
}
