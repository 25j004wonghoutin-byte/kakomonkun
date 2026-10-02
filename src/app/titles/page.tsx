import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TitleShop, type TitleShopInitialData } from "./title-shop";
import { backfillTitleUnlocks } from "@/lib/titles/unlocks";
import { toTitleShopItems } from "@/lib/titles/shop";

export const dynamic = "force-dynamic";

export default async function TitlesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role.name !== "student" || !user.studentProfile) redirect("/");

  await backfillTitleUnlocks(prisma, user.id, new Date());

  const [profile, titles] = await Promise.all([
    prisma.studentProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: {
        totalPoints: true,
        currentTitle: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.title.findMany({
      where: {
        isActive: true,
        catalogKey: { not: null },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        pricePoints: true,
        catalogKey: true,
        acquisitionKind: true,
        isActive: true,
        unlocks: { where: { userId: user.id }, select: { titleId: true }, take: 1 },
        userTitles: {
          where: { userId: user.id },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);

  const initialData: TitleShopInitialData = {
    displayName: user.displayName,
    totalPoints: profile.totalPoints,
    currentTitle: profile.currentTitle,
    titles: toTitleShopItems(titles.map(({ unlocks, ...title }) => ({ ...title, userTitleUnlocks: unlocks })), profile.totalPoints),
  };

  return <TitleShop initialData={initialData} />;
}
