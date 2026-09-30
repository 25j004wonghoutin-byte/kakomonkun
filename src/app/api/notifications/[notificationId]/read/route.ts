import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/http";
import { isUuid } from "@/lib/board/validation";
import { markNotificationRead } from "@/lib/notifications/write";

export async function PATCH(
  _request: Request,
  context: RouteContext<"/api/notifications/[notificationId]/read">,
) {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized("ログインが必要です。");
  }

  const { notificationId } = await context.params;
  if (!isUuid(notificationId)) {
    return badRequest("通知IDが正しくありません。");
  }

  const result = await markNotificationRead(user.id, notificationId);
  if (result === "not_found") {
    return notFound("通知が見つかりません。");
  }

  return Response.json({ status: "changed" });
}
