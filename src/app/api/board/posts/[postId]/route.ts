import { getCurrentUser } from "@/lib/auth";
import { getBoardThread } from "@/lib/board/read";
import { isUuid } from "@/lib/board/validation";
import { badRequest, notFound, unauthorized } from "@/lib/http";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/board/posts/[postId]">,
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const { postId } = await context.params;
  if (!isUuid(postId)) {
    return badRequest("投稿IDが正しくありません。");
  }

  const thread = await getBoardThread(viewer.id, postId);
  return thread
    ? Response.json(thread)
    : notFound("投稿が見つかりません。");
}
