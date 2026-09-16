import { getCurrentUser } from "@/lib/auth";
import {
  InvalidBoardCursorError,
  listBoardPosts,
} from "@/lib/board/read";
import type { BoardScope } from "@/lib/board/contract";
import { toBoardActor } from "@/lib/board/permissions";
import { createBoardPost } from "@/lib/board/write-posts";
import { parseCreatePostPayload } from "@/lib/board/validation";
import { badRequest, forbidden, unauthorized } from "@/lib/http";

export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const { searchParams } = new URL(request.url);
  const requestedScope = searchParams.get("scope") ?? "all";
  if (requestedScope !== "all" && requestedScope !== "mine") {
    return badRequest("表示範囲が正しくありません。");
  }

  const scope: BoardScope = requestedScope;
  const cursor = searchParams.get("cursor");

  try {
    return Response.json(await listBoardPosts(viewer.id, scope, cursor));
  } catch (error) {
    if (error instanceof InvalidBoardCursorError) {
      return badRequest("ページ情報が正しくありません。");
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return unauthorized("ログインが必要です。");
  }

  const actor = toBoardActor(viewer.id, viewer.role.name);
  if (!actor) {
    return forbidden("掲示板へ投稿できません。");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return badRequest("JSONの形式が正しくありません。");
  }

  const payload = parseCreatePostPayload(value);
  if (!payload) {
    return badRequest("投稿内容は1文字以上280文字以内で入力してください。");
  }

  const created = await createBoardPost(actor, payload.body);
  return Response.json(created, { status: 201 });
}
