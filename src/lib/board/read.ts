import { Prisma } from "../../../prisma/generated/client";
import { prisma } from "@/lib/prisma";
import {
  toBoardAuthor,
  toBoardPublicProfileIdentity,
  type BoardActor,
  type BoardCommentView,
  type BoardCursor,
  type BoardPostView,
  type BoardPublicProfileView,
  type BoardScope,
  type BoardThreadView,
} from "@/lib/board/contract";
import { decodeBoardCursor, encodeBoardCursor } from "@/lib/board/cursor";
import {
  canDeleteContent,
  canPinPost,
  toBoardActor,
} from "@/lib/board/permissions";

const PAGE_SIZE = 20;

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

const postWithAuthorInclude = {
  author: { select: publicAuthorSelect },
} as const;

type BoardPostRow = Prisma.BoardPostGetPayload<{
  include: typeof postWithAuthorInclude;
}>;

export class InvalidBoardCursorError extends Error {
  constructor() {
    super("Invalid board cursor");
    this.name = "InvalidBoardCursorError";
  }
}

async function requireBoardActor(viewerId: string): Promise<BoardActor> {
  const viewer = await prisma.user.findFirst({
    where: { id: viewerId, status: "active", deletedAt: null },
    select: { id: true, role: { select: { name: true } } },
  });
  const actor = viewer ? toBoardActor(viewer.id, viewer.role.name) : null;

  if (!actor) {
    throw new Error("Board viewer is unavailable");
  }

  return actor;
}

function parseCursor(
  scope: BoardScope,
  cursor: string | null,
): BoardCursor | null {
  if (!cursor) {
    return null;
  }

  const parsed = decodeBoardCursor(scope, cursor);
  if (!parsed) {
    throw new InvalidBoardCursorError();
  }

  return parsed;
}

export function cursorWhereFor(
  scope: BoardScope,
  cursor: BoardCursor | null,
): Prisma.BoardPostWhereInput {
  if (!cursor) {
    return {};
  }

  const createdAt = new Date(cursor.createdAt);
  const olderDate = { createdAt: { lt: createdAt } };
  const olderId = { createdAt, id: { lt: cursor.id } };

  if (scope === "mine") {
    return { OR: [olderDate, olderId] };
  }

  if (cursor.isPinned) {
    return {
      OR: [
        { isPinned: true, ...olderDate },
        { isPinned: true, ...olderId },
        { isPinned: false },
      ],
    };
  }

  return { isPinned: false, OR: [olderDate, olderId] };
}

async function toBoardPostViews(
  rows: BoardPostRow[],
  actor: BoardActor,
  activities?: Map<string, Date>,
): Promise<BoardPostView[]> {
  const postIds = rows.map((row) => row.id);
  if (postIds.length === 0) {
    return [];
  }

  const [commentGroups, likeGroups, likedRows] = await Promise.all([
    prisma.boardComment.groupBy({
      by: ["postId"],
      where: {
        postId: { in: postIds },
        deletedAt: null,
        author: { status: "active", deletedAt: null },
      },
      _count: { _all: true },
    }),
    prisma.boardPostLike.groupBy({
      by: ["postId"],
      where: { postId: { in: postIds } },
      _count: { _all: true },
    }),
    prisma.boardPostLike.findMany({
      where: { userId: actor.id, postId: { in: postIds } },
      select: { postId: true },
    }),
  ]);

  const commentCounts = new Map(
    commentGroups.map((row) => [row.postId, row._count._all]),
  );
  const likeCounts = new Map(
    likeGroups.map((row) => [row.postId, row._count._all]),
  );
  const likedPostIds = new Set(likedRows.map((row) => row.postId));

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    isPinned: row.isPinned,
    ...(activities?.has(row.id)
      ? { activityAt: activities.get(row.id)!.toISOString() }
      : {}),
    createdAt: row.createdAt.toISOString(),
    author: toBoardAuthor(row.author),
    commentCount: commentCounts.get(row.id) ?? 0,
    likeCount: likeCounts.get(row.id) ?? 0,
    likedByMe: likedPostIds.has(row.id),
    canDelete: canDeleteContent(actor, row.authorId),
    canPin: canPinPost(actor, row.author.role.name),
  }));
}

function nextCursorFor(
  scope: BoardScope,
  rows: BoardPostRow[],
  hasMore: boolean,
): string | null {
  if (!hasMore || rows.length === 0) {
    return null;
  }

  const last = rows.at(-1);
  if (!last) {
    return null;
  }

  return encodeBoardCursor(scope, {
    ...(scope === "all" ? { isPinned: last.isPinned } : {}),
    createdAt: last.createdAt.toISOString(),
    id: last.id,
  });
}

type BoardActivityRow = {
  id: string;
  isPinned: boolean;
  createdAt: Date;
  activityAt: Date;
};

export async function listBoardPosts(
  viewerId: string,
  scope: BoardScope,
  cursor: string | null,
): Promise<{ posts: BoardPostView[]; nextCursor: string | null }> {
  const actor = await requireBoardActor(viewerId);
  const parsedCursor = parseCursor(scope, cursor);
  const activityAt = parsedCursor
    ? new Date(parsedCursor.activityAt ?? parsedCursor.createdAt)
    : null;
  const afterCursor = !parsedCursor
    ? Prisma.empty
    : scope === "all"
      ? Prisma.sql`AND (p.is_pinned, activity.at, p.id) <
          (${parsedCursor.isPinned}, ${activityAt}, ${parsedCursor.id}::uuid)`
      : Prisma.sql`AND (activity.at, p.id) < (${activityAt}, ${parsedCursor.id}::uuid)`;

  // The existing post/date comment index supports the latest visible reply lookup.
  // Derive activity instead of changing a parent timestamp for likes, pins or replies.
  const activityRows = await prisma.$queryRaw<BoardActivityRow[]>(Prisma.sql`
    SELECT p.id, p.is_pinned AS "isPinned", p.created_at AS "createdAt",
      activity.at AS "activityAt"
    FROM public.board_posts p
    JOIN public.users author ON author.id = p.author_id
    LEFT JOIN LATERAL (
      SELECT reply.created_at
      FROM public.board_comments reply
      JOIN public.users reply_author ON reply_author.id = reply.author_id
      WHERE reply.post_id = p.id AND reply.deleted_at IS NULL
        AND reply_author.status = 'active' AND reply_author.deleted_at IS NULL
      ORDER BY reply.created_at DESC, reply.id DESC
      LIMIT 1
    ) latest_reply ON true
    CROSS JOIN LATERAL (
      SELECT GREATEST(p.created_at, latest_reply.created_at) AS at
    ) activity
    WHERE p.deleted_at IS NULL AND author.status = 'active' AND author.deleted_at IS NULL
      ${scope === "mine" ? Prisma.sql`AND p.author_id = ${viewerId}::uuid` : Prisma.empty}
      ${afterCursor}
    ORDER BY ${scope === "all" ? Prisma.sql`p.is_pinned DESC,` : Prisma.empty}
      activity.at DESC, p.id DESC
    LIMIT ${PAGE_SIZE + 1}
  `);
  const page = activityRows.slice(0, PAGE_SIZE);
  const rows = page.length === 0 ? [] : await prisma.boardPost.findMany({
    where: {
      id: { in: page.map((row) => row.id) },
      deletedAt: null,
      author: { status: "active", deletedAt: null },
    },
    include: postWithAuthorInclude,
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = page.flatMap((row) => {
    const post = rowsById.get(row.id);
    return post ? [post] : [];
  });
  const last = page.at(-1);

  return {
    posts: await toBoardPostViews(orderedRows, actor,
      new Map(page.map((row) => [row.id, row.activityAt]))),
    nextCursor: activityRows.length > PAGE_SIZE && last
      ? encodeBoardCursor(scope, {
          ...(scope === "all" ? { isPinned: last.isPinned } : {}),
          createdAt: last.createdAt.toISOString(),
          activityAt: last.activityAt.toISOString(),
          id: last.id,
        })
      : null,
  };
}

export async function getBoardThread(
  viewerId: string,
  postId: string,
): Promise<BoardThreadView | null> {
  const actor = await requireBoardActor(viewerId);
  const post = await prisma.boardPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
      author: { status: "active", deletedAt: null },
    },
    include: postWithAuthorInclude,
  });

  if (!post) {
    return null;
  }

  const [comments, likeCount, likedByMe] = await Promise.all([
    prisma.boardComment.findMany({
      where: {
        postId,
        deletedAt: null,
        author: { status: "active", deletedAt: null },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { author: { select: publicAuthorSelect } },
    }),
    prisma.boardPostLike.count({ where: { postId } }),
    prisma.boardPostLike.findUnique({
      where: { postId_userId: { postId, userId: actor.id } },
      select: { postId: true },
    }),
  ]);

  const postView: BoardPostView = {
    id: post.id,
    body: post.body,
    isPinned: post.isPinned,
    createdAt: post.createdAt.toISOString(),
    author: toBoardAuthor(post.author),
    commentCount: comments.length,
    likeCount,
    likedByMe: likedByMe !== null,
    canDelete: canDeleteContent(actor, post.authorId),
    canPin: canPinPost(actor, post.author.role.name),
  };

  const commentViews: BoardCommentView[] = comments.map((comment) => ({
    id: comment.id,
    postId: comment.postId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: toBoardAuthor(comment.author),
    canDelete: canDeleteContent(actor, comment.authorId),
  }));

  return { post: postView, comments: commentViews };
}

export async function getBoardPublicProfile(
  viewerId: string,
  userId: string,
  cursor: string | null,
): Promise<BoardPublicProfileView | null> {
  const actor = await requireBoardActor(viewerId);
  const parsedCursor = parseCursor("mine", cursor);
  const cursorWhere = cursorWhereFor("mine", parsedCursor);

  const profile = await prisma.user.findFirst({
    where: { id: userId, status: "active", deletedAt: null },
    select: {
      id: true,
      displayName: true,
      role: { select: { name: true } },
      studentProfile: {
        select: {
          avatarUrl: true,
          bio: true,
          currentTitle: { select: { name: true } },
        },
      },
      teacherProfile: { select: { avatarUrl: true } },
    },
  });

  if (!profile || !toBoardActor(profile.id, profile.role.name)) {
    return null;
  }

  const [rows, postCount] = await Promise.all([
    prisma.boardPost.findMany({
      where: {
        authorId: userId,
        deletedAt: null,
        ...cursorWhere,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      include: postWithAuthorInclude,
    }),
    prisma.boardPost.count({
      where: { authorId: userId, deletedAt: null },
    }),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);
  const publicIdentity = toBoardPublicProfileIdentity(profile);

  return {
    ...publicIdentity,
    postCount,
    posts: await toBoardPostViews(pageRows, actor),
    nextCursor: nextCursorFor("mine", pageRows, hasMore),
  };
}
