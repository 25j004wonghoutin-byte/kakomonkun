import { getCurrentUser } from "@/lib/auth";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type EquipTitleBody = {
  titleId?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role.name !== "student" || !user.studentProfile) return forbidden();

  let body: EquipTitleBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (typeof body.titleId !== "string" || !isUuid(body.titleId)) {
    return badRequest("A valid titleId is required");
  }

  const ownedTitle = await prisma.userTitle.findUnique({
    where: {
      userId_titleId: {
        userId: user.id,
        titleId: body.titleId,
      },
    },
    select: {
      id: true,
      title: {
        select: {
          id: true,
          name: true,
          description: true,
          rarity: true,
          isActive: true,
        },
      },
    },
  });

  if (!ownedTitle) return notFound("Owned title not found");
  if (!ownedTitle.title.isActive) return forbidden("This title is not currently available");

  const equippedAt = new Date();
  await prisma.$transaction([
    prisma.studentProfile.update({
      where: { userId: user.id },
      data: { currentTitleId: ownedTitle.title.id },
    }),
    prisma.userTitle.update({
      where: { id: ownedTitle.id },
      data: { equippedAt },
    }),
  ]);

  const currentTitle = {
    id: ownedTitle.title.id,
    name: ownedTitle.title.name,
    description: ownedTitle.title.description,
    rarity: ownedTitle.title.rarity,
  };
  return Response.json({ currentTitle, equippedAt: equippedAt.toISOString() });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
