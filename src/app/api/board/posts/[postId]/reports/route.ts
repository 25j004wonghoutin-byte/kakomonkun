import { getCurrentUser } from "@/lib/auth";
import { isBoardReportReason } from "@/lib/board/moderation-contract";
import { reportBoardPost } from "@/lib/board/reports";
import { isUuid } from "@/lib/board/validation";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) return unauthorized("ログインが必要です。");
  if (viewer.role.name !== "student") return forbidden("通報は学生のみ利用できます。");

  const { postId } = await context.params;
  if (!isUuid(postId)) return badRequest("投稿IDが正しくありません。");

  const payload: unknown = await request.json().catch(() => null);
  const reason = payload && typeof payload === "object" && "reason" in payload ? payload.reason : null;
  if (!isBoardReportReason(reason)) return badRequest("通報理由を選んでください。");

  const result = await reportBoardPost({ id: viewer.id, roleName: "student" }, postId, reason);
  if (result === "not_found") return notFound("通報できる投稿が見つかりません。");
  if (result === "forbidden") return forbidden("この投稿は通報できません。");
  return Response.json({ accepted: true }, { status: 202 });
}
