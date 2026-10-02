import { getCurrentUser } from "@/lib/auth";
import { badRequest, conflict, forbidden, notFound, serverError, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { purchaseTitle, TitlePurchaseError } from "@/lib/titles/purchase";

type PurchaseTitleBody = { titleId?: unknown };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role.name !== "student" || !user.studentProfile) return forbidden();

  let body: PurchaseTitleBody | null;
  try { body = await request.json(); } catch { return badRequest("Invalid JSON body"); }
  if (!body || typeof body !== "object" || typeof body.titleId !== "string" || !isUuid(body.titleId)) return badRequest("A valid titleId is required");

  try {
    const result = await prisma.$transaction((tx) => purchaseTitle(tx, user.id, body.titleId as string, new Date()), { timeout: 30_000 });
    return Response.json({ title: result.title, totalPoints: result.totalPoints, purchasedAt: result.purchasedAt.toISOString() });
  } catch (cause) {
    if (cause instanceof TitlePurchaseError) {
      switch (cause.code) {
        case "unavailable": return notFound("購入できる称号が見つかりません。");
        case "locked": return forbidden("購入条件未達成です。");
        case "owned": return conflict("この称号はすでに所持しています。");
        case "insufficient": return conflict("ポイントが不足しています。");
      }
    }
    if (isUniqueConstraintError(cause)) return conflict("この称号はすでに所持しています。");
    console.error("Title purchase failed", cause);
    return serverError();
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isUniqueConstraintError(cause: unknown) {
  return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "P2002");
}
