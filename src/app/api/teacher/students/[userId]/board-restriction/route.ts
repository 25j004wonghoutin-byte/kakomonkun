import { parseRestrictionExpiry } from "@/lib/board/moderation-contract";
import { setBoardRestriction } from "@/lib/board/restrictions";
import { isUuid } from "@/lib/board/validation";
import { badRequest, forbidden, notFound } from "@/lib/http";
import { getTeacherApiUser } from "@/lib/teacher/auth";

type Context = { params: Promise<{ userId: string }> };

export async function PUT(request: Request, { params }: Context) {
  if (!await getTeacherApiUser()) return forbidden("教員のみ操作できます。");
  const { userId } = await params;
  if (!isUuid(userId)) return badRequest("学生IDが正しくありません。");

  const payload: unknown = await request.json().catch(() => null);
  const expiresAt = parseRestrictionExpiry(
    payload && typeof payload === "object" && "expiresAt" in payload ? payload.expiresAt : null,
  );
  if (!expiresAt) return badRequest("未来の解除日時を日本時間で指定してください。");

  const result = await setBoardRestriction(userId, expiresAt);
  if (result === "not_found") return notFound("学生が見つかりません。");
  if (result === "invalid_expiry") return badRequest("未来の解除日時を指定してください。");
  return Response.json({ expiresAt: expiresAt.toISOString() });
}

export async function DELETE(_request: Request, { params }: Context) {
  if (!await getTeacherApiUser()) return forbidden("教員のみ操作できます。");
  const { userId } = await params;
  if (!isUuid(userId)) return badRequest("学生IDが正しくありません。");

  const result = await setBoardRestriction(userId, null);
  if (result === "not_found") return notFound("学生が見つかりません。");
  return Response.json({ expiresAt: null });
}
