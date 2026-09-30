import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { getUnreadNotificationCount } from "@/lib/notifications/read";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized("ログインが必要です。");
  }

  return Response.json({
    unreadCount: await getUnreadNotificationCount(user.id),
  });
}
