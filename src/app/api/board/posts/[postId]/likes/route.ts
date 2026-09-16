import { getCurrentUser } from "@/lib/auth";
import { toBoardActor } from "@/lib/board/permissions";
import { isUuid } from "@/lib/board/validation";
import { likeBoardPost, unlikeBoardPost } from "@/lib/board/write-likes";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/http";

export async function PUT(
  _request: Request,
  context: RouteContext<"/api/board/posts/[postId]/likes">,
) {
  const contextResult = await getContext(context);
  if (contextResult instanceof Response) {
    return contextResult;
  }

  const result = await likeBoardPost(contextResult.actor, contextResult.postId);
  return result === "not_found"
    ? notFound("投稿が見つかりません。")
    : Response.json({ liked: true });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/board/posts/[postId]/likes">,
) {
  const contextResult = await getContext(context);
  if (contextResult instanceof Response) {
    return contextResult;
  }

  const result = await unlikeBoardPost(
    contextResult.actor,
    contextResult.postId,
  );
  return result === "not_found"
    ? notFound("投稿が見つかりません。")
    : Response.json({ liked: false });
}

async function getContext(
  context: RouteContext<"/api/board/posts/[postId]/likes">,
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const actor = toBoardActor(viewer.id, viewer.role.name);
  if (!actor) {
    return forbidden("いいねできません。");
  }

  const { postId } = await context.params;
  if (!isUuid(postId)) {
    return badRequest("投稿IDが正しくありません。");
  }

  return { actor, postId };
}
