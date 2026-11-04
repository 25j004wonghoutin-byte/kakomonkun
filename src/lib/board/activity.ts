import type { BoardPostView, BoardScope } from "./contract";

type ActivityPost = Pick<
  BoardPostView,
  "id" | "createdAt" | "activityAt" | "isPinned" | "commentCount"
>;

function compareBoardActivity(
  left: ActivityPost,
  right: ActivityPost,
  scope: BoardScope,
): number {
  if (scope === "all" && left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }
  const timeDifference = Date.parse(right.activityAt ?? right.createdAt)
    - Date.parse(left.activityAt ?? left.createdAt);
  return timeDifference || (left.id === right.id ? 0 : left.id > right.id ? -1 : 1);
}

export function promoteRepliedPost<T extends ActivityPost>(
  posts: readonly T[],
  postId: string,
  repliedAt: string,
  scope: BoardScope,
): T[] {
  return posts
    .map((post) => post.id === postId
      ? {
          ...post,
          commentCount: post.commentCount + 1,
          activityAt: Date.parse(repliedAt) > Date.parse(post.activityAt ?? post.createdAt)
            ? repliedAt
            : post.activityAt ?? post.createdAt,
        }
      : post)
    .sort((left, right) => compareBoardActivity(left, right, scope));
}

export function mergeBoardPage<T extends ActivityPost>(
  current: readonly T[],
  incoming: readonly T[],
  scope: BoardScope,
): T[] {
  const posts = new Map(current.map((post) => [post.id, post]));
  for (const post of incoming) {
    posts.set(post.id, post);
  }
  return [...posts.values()].sort((left, right) => compareBoardActivity(left, right, scope));
}
