import { getCurrentUser } from "@/lib/auth";
import {
  InvalidBoardCursorError,
  listBoardPosts,
} from "@/lib/board/read";
import type { BoardScope } from "@/lib/board/contract";
import { badRequest, unauthorized } from "@/lib/http";

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
