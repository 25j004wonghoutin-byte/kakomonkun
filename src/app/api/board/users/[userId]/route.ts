import { getCurrentUser } from "@/lib/auth";
import {
  getBoardPublicProfile,
  InvalidBoardCursorError,
} from "@/lib/board/read";
import { isUuid } from "@/lib/board/validation";
import { badRequest, notFound, unauthorized } from "@/lib/http";

export async function GET(
  request: Request,
  context: RouteContext<"/api/board/users/[userId]">,
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const { userId } = await context.params;
  if (!isUuid(userId)) {
    return badRequest("ユーザーIDが正しくありません。");
  }

  const cursor = new URL(request.url).searchParams.get("cursor");

  try {
    const profile = await getBoardPublicProfile(viewer.id, userId, cursor);
    return profile
      ? Response.json(profile)
      : notFound("プロフィールが見つかりません。");
  } catch (error) {
    if (error instanceof InvalidBoardCursorError) {
      return badRequest("ページ情報が正しくありません。");
    }
    throw error;
  }
}
