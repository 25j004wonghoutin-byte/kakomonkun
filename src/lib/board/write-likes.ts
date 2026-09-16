import { prisma } from "@/lib/prisma";
import type { BoardActor } from "@/lib/board/contract";
import { canInteractWithPost } from "@/lib/board/permissions";

export async function likeBoardPost(
  actor: BoardActor,
  postId: string,
): Promise<"liked" | "not_found"> {
  return prisma.$transaction(async (tx) => {
    const post = await tx.boardPost.findUnique({
      where: { id: postId },
      select: { deletedAt: true },
    });
    if (!post || !canInteractWithPost(post.deletedAt)) {
      return "not_found";
    }

    await tx.boardPostLike.createMany({
      data: [{ postId, userId: actor.id }],
      skipDuplicates: true,
    });
    return "liked";
  });
}

export async function unlikeBoardPost(
  actor: BoardActor,
  postId: string,
): Promise<"unliked" | "not_found"> {
  return prisma.$transaction(async (tx) => {
    const post = await tx.boardPost.findUnique({
      where: { id: postId },
      select: { deletedAt: true },
    });
    if (!post || !canInteractWithPost(post.deletedAt)) {
      return "not_found";
    }

    await tx.boardPostLike.deleteMany({
      where: { postId, userId: actor.id },
    });
    return "unliked";
  });
}
