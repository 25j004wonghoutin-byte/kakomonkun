import { redirect } from "next/navigation";
import { RoleShell } from "@/components/role-shell";
import { getCurrentUser } from "@/lib/auth";
import { toBoardActor } from "@/lib/board/permissions";
import { listBoardPosts } from "@/lib/board/read";
import { getBoardRestrictionExpiry } from "@/lib/board/restrictions";
import { BoardFeed } from "./board-feed";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const actor = toBoardActor(user.id, user.role.name);
  if (!actor) {
    redirect("/");
  }

  const [initial, restrictionExpiresAt] = await Promise.all([
    listBoardPosts(user.id, "all", null),
    getBoardRestrictionExpiry(user.id, user.role.name),
  ]);

  return (
    <RoleShell roleName={user.role.name} userId={user.id} userName={user.displayName} avatarUrl={user.role.name === "student" ? user.studentProfile?.avatarUrl ?? null : null}>
      <BoardFeed
        initialPosts={initial.posts}
        initialNextCursor={initial.nextCursor}
        restrictionExpiresAt={restrictionExpiresAt}
        viewer={{ ...actor, displayName: user.displayName, avatarUrl: user.role.name === "student" ? user.studentProfile?.avatarUrl ?? null : null }}
      />
    </RoleShell>
  );
}
