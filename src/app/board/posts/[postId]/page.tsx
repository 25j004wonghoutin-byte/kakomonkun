import { notFound, redirect } from "next/navigation";
import { RoleShell } from "@/components/role-shell";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRestrictionExpiry } from "@/lib/board/restrictions";
import { getBoardThread } from "@/lib/board/read";
import { isUuid } from "@/lib/board/validation";
import { PostDetail } from "./post-detail";

export const dynamic = "force-dynamic";

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { postId } = await params;
  if (!isUuid(postId)) {
    notFound();
  }

  const [thread, restrictionExpiresAt] = await Promise.all([
    getBoardThread(user.id, postId),
    getBoardRestrictionExpiry(user.id, user.role.name),
  ]);
  if (!thread) {
    notFound();
  }

  return (
    <RoleShell roleName={user.role.name} userId={user.id} userName={user.displayName} avatarUrl={user.role.name === "student" ? user.studentProfile?.avatarUrl ?? null : null}>
      <PostDetail initialThread={thread} restrictionExpiresAt={restrictionExpiresAt} canReport={user.role.name === "student" && user.id !== thread.post.author.id} viewerName={user.displayName} viewerAvatarUrl={user.role.name === "student" ? user.studentProfile?.avatarUrl ?? null : null} viewerIsTeacher={user.role.name === "teacher"} />
    </RoleShell>
  );
}
