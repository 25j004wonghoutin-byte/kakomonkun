import { notFound, redirect } from "next/navigation";
import { PublicProfile } from "@/components/public-user-profile";
import { getPublicProfileViewer } from "@/app/users/viewer";
import { getBoardPublicProfile } from "@/lib/board/read";
import { isUuid } from "@/lib/board/validation";
import { getProfileReturnTarget } from "@/lib/public-profile-navigation";

export const dynamic = "force-dynamic";

export default async function PublicUserPage({ params, searchParams }: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const user = await getPublicProfileViewer();
  if (!user) redirect("/login");
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  const profile = await getBoardPublicProfile(user.id, userId, null);
  if (!profile) notFound();
  const backTarget = getProfileReturnTarget((await searchParams).returnTo);
  return <PublicProfile key={profile.id} initialProfile={profile} viewerName={user.displayName} viewerId={user.id} backTarget={backTarget} />;
}
