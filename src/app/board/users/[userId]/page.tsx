import { notFound, redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { getCurrentUser } from "@/lib/auth";
import { getBoardPublicProfile } from "@/lib/board/read";
import { isUuid } from "@/lib/board/validation";
import { PublicProfile } from "./public-profile";

export const dynamic = "force-dynamic";

export default async function BoardUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { userId } = await params;
  if (!isUuid(userId)) {
    notFound();
  }

  const profile = await getBoardPublicProfile(user.id, userId, null);
  if (!profile) {
    notFound();
  }

  return (
    <StudentShell userName={user.displayName}>
      <PublicProfile initialProfile={profile} viewerName={user.displayName} />
    </StudentShell>
  );
}
