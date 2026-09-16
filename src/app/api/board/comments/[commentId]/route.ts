import { getCurrentUser } from "@/lib/auth";
import { toBoardActor } from "@/lib/board/permissions";
import { isUuid } from "@/lib/board/validation";
import { deleteBoardComment } from "@/lib/board/write-comments";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/http";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/board/comments/[commentId]">,
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const actor = toBoardActor(viewer.id, viewer.role.name);
  if (!actor) {
    return forbidden("返信を削除できません。");
  }

  const { commentId } = await context.params;
  if (!isUuid(commentId)) {
    return badRequest("返信IDが正しくありません。");
  }

  const reason = await readDeletionReason(request);
  if (reason === null) {
    return badRequest("削除理由は200文字以内で入力してください。");
  }

  const result = await deleteBoardComment(actor, commentId, reason);
  if (result === "not_found") {
    return notFound("返信が見つかりません。");
  }
  if (result === "forbidden") {
    return forbidden("この返信は削除できません。");
  }

  return new Response(null, { status: 204 });
}

async function readDeletionReason(
  request: Request,
): Promise<string | undefined | null> {
  const text = await request.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") {
      return null;
    }

    const reason = (value as Record<string, unknown>).reason;
    if (reason === undefined) {
      return undefined;
    }
    if (typeof reason !== "string" || reason.length > 200) {
      return null;
    }

    return reason;
  } catch {
    return null;
  }
}
