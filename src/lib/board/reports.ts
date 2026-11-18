import type { Prisma } from "../../../prisma/generated/client";
import type { BoardActor } from "./contract";
import type { BoardReportReason } from "./moderation-contract";

export async function reportBoardPost(actor: BoardActor, postId: string, reason: BoardReportReason) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction((tx) => reportBoardPostInTransaction(tx, actor, postId, reason));
}

export async function reportBoardPostInTransaction(
  tx: Prisma.TransactionClient,
  actor: BoardActor,
  postId: string,
  reason: BoardReportReason,
) {
  if (actor.roleName !== "student") return "forbidden";
  const post = await tx.boardPost.findFirst({
    where: { id: postId, deletedAt: null, authorId: { not: actor.id } },
    select: { id: true },
  });
  if (!post) return "not_found";

  // The pending-report index deduplicates concurrent requests. No reporter is stored.
  const [report] = await tx.boardReport.createManyAndReturn({
    data: [{ postId: post.id, reason }],
    skipDuplicates: true,
    select: { id: true },
  });
  if (!report) return "accepted";

  const teachers = await tx.user.findMany({
    where: { role: { name: "teacher" }, status: "active", deletedAt: null },
    select: { id: true },
  });
  if (teachers.length) {
    await tx.notification.createMany({
      data: teachers.map(({ id }) => ({
        recipientId: id,
        type: "board_report",
        boardReportId: report.id,
      })),
    });
  }
  return "accepted";
}

export async function listBoardReports(resolved: boolean, cursor: string | null) {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.boardReport.findMany({
    where: { resolvedAt: resolved ? { not: null } : null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: 26,
    select: {
      id: true,
      reason: true,
      createdAt: true,
      resolvedAt: true,
      post: {
        select: {
          id: true,
          body: true,
          deletedAt: true,
          author: { select: { id: true, displayName: true, role: { select: { name: true } } } },
        },
      },
    },
  });
  return { reports: rows.slice(0, 25), nextCursor: rows.length > 25 ? rows[24].id : null };
}

export async function resolveBoardReport(id: string) {
  const { prisma } = await import("@/lib/prisma");
  await prisma.boardReport.updateMany({
    where: { id, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}
