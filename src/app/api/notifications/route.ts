import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";
import {
  getUnreadNotificationCount,
  InvalidNotificationCursorError,
  listNotifications,
} from "@/lib/notifications/read";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized("ログインが必要です。");
  }

  const cursor = new URL(request.url).searchParams.get("cursor");

  try {
    const [page, unreadCount] = await Promise.all([
      listNotifications(user.id, cursor),
      getUnreadNotificationCount(user.id),
    ]);
    return Response.json({ ...page, unreadCount });
  } catch (error) {
    if (error instanceof InvalidNotificationCursorError) {
      return badRequest("ページ情報が正しくありません。");
    }
    throw error;
  }
}
