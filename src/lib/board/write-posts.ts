import { prisma } from "@/lib/prisma";
import type { BoardActor } from "@/lib/board/contract";
import {
  canDeleteContent,
  canPinPost,
} from "@/lib/board/permissions";

export type BoardPostMutationResult =
  | "changed"
  | "not_found"
  | "forbidden";

export async function createBoardPost(actor: BoardActor, body: string) {
  return prisma.boardPost.create({
    data: { authorId: actor.id, body },
    select: { id: true, isPinned: true },
  });
}

export async function setBoardPostPin(
  actor: BoardActor,
  postId: string,
  isPinned: boolean,
): Promise<BoardPostMutationResult> {
  const post = await prisma.boardPost.findUnique({
    where: { id: postId },
    select: {
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

  const changed = await prisma.boardPost.updateMany({
    where: { id: postId, deletedAt: null },
    data: { isPinned },
  });

  return changed.count === 1 ? "changed" : "not_found";
}

export async function deleteBoardPost(
  actor: BoardActor,
  postId: string,
  reason?: string,
): Promise<BoardPostMutationResult> {
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
