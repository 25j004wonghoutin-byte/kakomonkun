import type { Prisma } from "../../../prisma/generated/client";
import { prisma } from "@/lib/prisma";
import {
  toBoardAuthor,
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

export async function listBoardPosts(
  viewerId: string,
  scope: BoardScope,
  cursor: string | null,
): Promise<{ posts: BoardPostView[]; nextCursor: string | null }> {
  const actor = await requireBoardActor(viewerId);
  const parsedCursor = parseCursor(scope, cursor);
  const cursorWhere = cursorWhereFor(scope, parsedCursor);

  const rows = await prisma.boardPost.findMany({
    where: {
      deletedAt: null,
      author: { status: "active", deletedAt: null },
      ...(scope === "mine" ? { authorId: viewerId } : {}),
      ...cursorWhere,
    },
    orderBy:
      scope === "all"
        ? [
            { isPinned: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ]
        : [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    include: postWithAuthorInclude,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

  return {
    posts: await toBoardPostViews(pageRows, actor),
    nextCursor: nextCursorFor(scope, pageRows, hasMore),
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
  const author = toBoardAuthor(profile);

  return {
    id: profile.id,
    displayName: profile.displayName,
    avatarUrl: author.avatarUrl,
    bio: author.isTeacher ? null : (profile.studentProfile?.bio ?? null),
    titleName: author.titleName,
    isTeacher: author.isTeacher,
    postCount,
    posts: await toBoardPostViews(pageRows, actor),
    nextCursor: nextCursorFor("mine", pageRows, hasMore),
  };
}
