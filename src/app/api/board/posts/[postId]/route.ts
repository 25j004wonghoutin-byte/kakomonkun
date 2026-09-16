import { getCurrentUser } from "@/lib/auth";
import { getBoardThread } from "@/lib/board/read";
import { toBoardActor } from "@/lib/board/permissions";
import { isUuid } from "@/lib/board/validation";
import { deleteBoardPost } from "@/lib/board/write-posts";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/http";

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

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/board/posts/[postId]">,
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const actor = toBoardActor(viewer.id, viewer.role.name);
  if (!actor) {
    return forbidden("投稿を削除できません。");
  }

  const { postId } = await context.params;
  if (!isUuid(postId)) {
    return badRequest("投稿IDが正しくありません。");
  }

  const parsedReason = await readDeletionReason(request);
  if (parsedReason === null) {
    return badRequest("削除理由は200文字以内で入力してください。");
  }

  const result = await deleteBoardPost(actor, postId, parsedReason);
  if (result === "not_found") {
    return notFound("投稿が見つかりません。");
  }
  if (result === "forbidden") {
    return forbidden("この投稿は削除できません。");
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
