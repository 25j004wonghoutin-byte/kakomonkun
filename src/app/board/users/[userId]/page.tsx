import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/board/validation";
import { getPublicProfileHref } from "@/lib/public-profile-navigation";

export default async function BoardUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  redirect(getPublicProfileHref(userId));
}
