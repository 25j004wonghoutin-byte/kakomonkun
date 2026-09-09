import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TitleShop, type TitleShopInitialData } from "./title-shop";

export const dynamic = "force-dynamic";

export default async function TitlesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role.name !== "student" || !user.studentProfile) redirect("/");

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
        pricePoints: { gt: 0 },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        pricePoints: true,
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
    titles: titles.map(({ userTitles, ...title }) => ({
      ...title,
      owned: userTitles.length > 0,
    })),
  };

  return <TitleShop initialData={initialData} />;
}
