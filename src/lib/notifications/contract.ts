export type NotificationType =
  | "board_reply"
  | "board_pinned"
  | "title_unlocked";

export type NotificationView = {
  id: string;
  type: NotificationType;
  actorName: string | null;
  message: string;
  postId: string | null;
  readAt: string | null;
  createdAt: string;
  targetAvailable: boolean;
};

export function notificationMessage(value: {
  type: NotificationType;
  actorName: string | null;
}): string {
  if (value.type === "board_reply") {
    return `${value.actorName ?? "ユーザー"}さんが投稿に返信しました`;
  }

  if (value.type === "board_pinned") {
    return "管理者から新しいお知らせがあります";
  }

  return "新しい称号の購入条件を達成しました";
}

export function notificationTarget(value: {
  type: NotificationType;
  postId: string | null;
}): string | null {
  if (value.type === "board_reply" || value.type === "board_pinned") {
    return value.postId ? `/board/posts/${value.postId}` : null;
  }

  return "/titles";
}
