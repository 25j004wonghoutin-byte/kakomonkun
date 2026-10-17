export type NotificationType =
  | "board_reply"
  | "board_pinned"
  | "title_unlocked"
  | "mock_exam_reminder";

export type NotificationView = {
  id: string;
  type: NotificationType;
  actorName: string | null;
  message: string;
  postId: string | null;
  targetMonth: string | null;
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

  if (value.type === "mock_exam_reminder") {
    return "今月の模擬試験は24日まで受験できます";
  }

  return "新しい称号の購入条件を達成しました";
}

export function notificationTarget(value: {
  type: NotificationType;
  postId: string | null;
  targetMonth?: string | null;
}): string | null {
  if (value.type === "board_reply" || value.type === "board_pinned") {
    return value.postId ? `/board/posts/${value.postId}` : null;
  }

  if (value.type === "mock_exam_reminder") {
    return value.targetMonth && /^(?!0000)[0-9]{4}-(?:0[1-9]|1[0-2])$/.test(value.targetMonth)
      ? `/mock-exam?month=${value.targetMonth}` : null;
  }

  return "/titles";
}
