import { getCurrentUser } from "@/lib/auth";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getTokyoDate } from "@/lib/tokyo-date";
import { Prisma } from "../../../../../prisma/generated/client";

type PurchaseTitleBody = {
  titleId?: unknown;
};

class InsufficientPointsError extends Error {}
class TitleUnavailableError extends Error {}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role.name !== "student" || !user.studentProfile) return forbidden();

  let body: PurchaseTitleBody | null;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.titleId !== "string" ||
    !isUuid(body.titleId)
  ) {
    return badRequest("A valid titleId is required");
  }

  const transactionDate = new Date(`${getTokyoDate()}T00:00:00.000Z`);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [title] = await tx.$queryRaw<
        Array<{ id: string; name: string; pricePoints: number }>
      >(Prisma.sql`
        SELECT "id", "name", "price_points" AS "pricePoints"
        FROM "titles"
        WHERE "id" = ${body.titleId}::uuid
          AND "is_active" = true
          AND "price_points" > 0
        FOR UPDATE
      `);

      if (!title) throw new TitleUnavailableError();

      const ownedTitle = await tx.userTitle.create({
        data: {
          userId: user.id,
          titleId: title.id,
        },
        select: { purchasedAt: true },
      });

      const updated = await tx.studentProfile.updateMany({
        where: {
          userId: user.id,
          totalPoints: { gte: title.pricePoints },
        },
        data: {
          totalPoints: { decrement: title.pricePoints },
        },
      });

      if (updated.count === 0) {
        throw new InsufficientPointsError();
      }

      await tx.pointTransaction.create({
        data: {
          userId: user.id,
          points: -title.pricePoints,
          reason: "title_purchase",
          sourceType: "title",
          sourceId: title.id,
          transactionDate,
          description: `称号「${title.name}」を購入`,
        },
      });

      const profile = await tx.studentProfile.findUniqueOrThrow({
        where: { userId: user.id },
        select: { totalPoints: true },
      });

      return {
        title: {
          id: title.id,
          name: title.name,
        },
        purchasedAt: ownedTitle.purchasedAt,
        totalPoints: profile.totalPoints,
      };
    });

    return Response.json({
      title: result.title,
      totalPoints: result.totalPoints,
      purchasedAt: result.purchasedAt.toISOString(),
    });
  } catch (cause) {
    if (cause instanceof TitleUnavailableError) {
      return notFound("購入できる称号が見つかりません。");
    }
    if (cause instanceof InsufficientPointsError) {
      return conflict("ポイントが不足しています。");
    }
    if (isUniqueConstraintError(cause)) {
      return conflict("この称号はすでに所持しています。");
    }

    console.error("Title purchase failed", cause);
    return serverError();
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isUniqueConstraintError(cause: unknown) {
  return Boolean(
    cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "P2002",
  );
}
