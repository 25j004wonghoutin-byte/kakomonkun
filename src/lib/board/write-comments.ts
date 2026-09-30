import type { Prisma } from "../../../prisma/generated/client";
import { prisma } from "@/lib/prisma";
import {
  toBoardAuthor,
  type BoardActor,
  type BoardCommentView,
} from "@/lib/board/contract";
import {
  canDeleteContent,
  canInteractWithPost,
} from "@/lib/board/permissions";
import { createBoardReplyNotification } from "@/lib/notifications/write";

const publicAuthorSelect = {
  id: true,
  displayName: true,
  role: { select: { name: true } },
  studentProfile: {
    select: {
      avatarUrl: true,
      currentTitle: { select: { name: true } },
    },
  },
  teacherProfile: { select: { avatarUrl: true } },
} as const;

export type BoardCommentMutationResult =
  | "changed"
  | "not_found"
  | "forbidden";

export async function createBoardComment(
  actor: BoardActor,
  postId: string,
  body: string,
): Promise<BoardCommentView | "not_found"> {
  const created = await prisma.$transaction((tx) =>
    createBoardCommentInTransaction(tx, actor, postId, body),
  );

  if (created === "not_found") {
    return created;
  }

  const author = await prisma.user.findUniqueOrThrow({
    where: { id: created.authorId },
    select: publicAuthorSelect,
  });

  return {
    id: created.id,
    postId: created.postId,
    body: created.body,
    createdAt: created.createdAt.toISOString(),
    author: toBoardAuthor(author),
    canDelete: canDeleteContent(actor, created.authorId),
  };
}

export async function createBoardCommentInTransaction(
  tx: Prisma.TransactionClient,
  actor: BoardActor,
  postId: string,
  body: string,
) {
  const post = await tx.boardPost.findUnique({
    where: { id: postId },
    select: {
      authorId: true,
      deletedAt: true,
      author: { select: { status: true, deletedAt: true } },
    },
  });
  if (!post || !canInteractWithPost(post.deletedAt)) {
    return "not_found" as const;
  }

  const created = await tx.boardComment.create({
    data: { postId, authorId: actor.id, body },
    select: {
      id: true,
      postId: true,
      authorId: true,
      body: true,
      createdAt: true,
    },
  });

  await createBoardReplyNotification(tx, {
    postAuthorId: post.authorId,
    postAuthorStatus: post.author.status,
    postAuthorDeletedAt: post.author.deletedAt,
    actorId: actor.id,
    boardCommentId: created.id,
  });

  return created;
}

export async function deleteBoardComment(
  actor: BoardActor,
  commentId: string,
  reason?: string,
): Promise<BoardCommentMutationResult> {
  const deletionReason =
    actor.roleName === "teacher" && reason
      ? reason.trim().slice(0, 200) || undefined
      : undefined;

  return prisma.$transaction(async (tx) => {
    const comment = await tx.boardComment.findUnique({
      where: { id: commentId },
      select: {
        authorId: true,
        deletedAt: true,
        post: { select: { deletedAt: true } },
      },
    });

    if (
      !comment ||
      comment.deletedAt ||
      !canInteractWithPost(comment.post.deletedAt)
    ) {
      return "not_found";
    }
    if (!canDeleteContent(actor, comment.authorId)) {
      return "forbidden";
    }

    const changed = await tx.boardComment.updateMany({
      where: { id: commentId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (changed.count !== 1) {
      return "not_found";
    }

    if (actor.roleName === "teacher") {
      await tx.boardDeleteLog.create({
        data: {
          targetType: "comment",
          targetId: commentId,
          deletedById: actor.id,
          reason: deletionReason,
        },
      });
    }

    return "changed";
  });
}
