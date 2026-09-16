import { getCurrentUser } from "@/lib/auth";
import { toBoardActor } from "@/lib/board/permissions";
import { parsePinPayload, isUuid } from "@/lib/board/validation";
import { setBoardPostPin } from "@/lib/board/write-posts";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/http";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/board/posts/[postId]/pin">,
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const actor = toBoardActor(viewer.id, viewer.role.name);
  if (!actor) {
    return forbidden("投稿を固定できません。");
  }

  const { postId } = await context.params;
  if (!isUuid(postId)) {
    return badRequest("投稿IDが正しくありません。");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return badRequest("JSONの形式が正しくありません。");
  }

  const payload = parsePinPayload(value);
  if (!payload) {
    return badRequest("固定状態が正しくありません。");
  }

  const result = await setBoardPostPin(actor, postId, payload.isPinned);
  if (result === "not_found") {
    return notFound("投稿が見つかりません。");
  }
  if (result === "forbidden") {
    return forbidden("この投稿は固定できません。");
  }

  return Response.json({ isPinned: payload.isPinned });
}
