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
