import { TEACHER_DISPLAY_NAME } from "@/lib/teacher/identity";

export type BoardRoleName = "student" | "teacher";

export type BoardActor = {
  id: string;
  roleName: BoardRoleName;
};

export type BoardScope = "all" | "mine";

export type BoardCursor = {
  isPinned?: boolean;
  createdAt: string;
  id: string;
};

export type BoardAuthorView = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  titleName: string | null;
  isTeacher: boolean;
};

export type PublicAuthorRow = {
  id: string;
  displayName: string;
  role: { name: string };
  studentProfile: {
    avatarUrl: string | null;
    currentTitle: { name: string } | null;
  } | null;
  teacherProfile: { avatarUrl: string | null } | null;
};

export function toBoardAuthor(row: PublicAuthorRow): BoardAuthorView {
  const isTeacher = row.role.name === "teacher";

  return {
    id: row.id,
    displayName: isTeacher ? TEACHER_DISPLAY_NAME : row.displayName,
    avatarUrl: isTeacher
      ? (row.teacherProfile?.avatarUrl ?? null)
      : (row.studentProfile?.avatarUrl ?? null),
    titleName: isTeacher
      ? null
      : (row.studentProfile?.currentTitle?.name ?? null),
    isTeacher,
  };
}

export type BoardPostView = {
  id: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  author: BoardAuthorView;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  canDelete: boolean;
  canPin: boolean;
};

export type BoardCommentView = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: BoardAuthorView;
  canDelete: boolean;
};

export type BoardThreadView = {
  post: BoardPostView;
  comments: BoardCommentView[];
};

export type BoardPublicProfileView = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  titleName: string | null;
  isTeacher: boolean;
  postCount: number;
  posts: BoardPostView[];
  nextCursor: string | null;
};

export type PublicProfileRow = PublicAuthorRow & {
  studentProfile: (PublicAuthorRow["studentProfile"] & {
    bio: string | null;
  }) | null;
};

export function toBoardPublicProfileIdentity(
  row: PublicProfileRow,
): Pick<
  BoardPublicProfileView,
  "id" | "displayName" | "avatarUrl" | "bio" | "titleName" | "isTeacher"
> {
  const author = toBoardAuthor(row);

  return {
    id: author.id,
    displayName: author.displayName,
    avatarUrl: author.avatarUrl,
    bio: author.isTeacher ? null : (row.studentProfile?.bio ?? null),
    titleName: author.titleName,
    isTeacher: author.isTeacher,
  };
}
