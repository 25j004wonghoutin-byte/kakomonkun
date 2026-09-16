import { getCurrentUser } from "@/lib/auth";
import { toBoardActor } from "@/lib/board/permissions";
import { parseBoardBody, isUuid } from "@/lib/board/validation";
import { createBoardComment } from "@/lib/board/write-comments";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/http";

export async function POST(
  request: Request,
  context: RouteContext<"/api/board/posts/[postId]/comments">,
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const actor = toBoardActor(viewer.id, viewer.role.name);
  if (!actor) {
    return forbidden("返信できません。");
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

  const body =
    value && typeof value === "object"
      ? parseBoardBody((value as Record<string, unknown>).body)
      : null;
  if (!body) {
    return badRequest("返信内容は1文字以上280文字以内で入力してください。");
  }

  const created = await createBoardComment(actor, postId, body);
  return created === "not_found"
    ? notFound("投稿が見つかりません。")
    : Response.json(created, { status: 201 });
}
