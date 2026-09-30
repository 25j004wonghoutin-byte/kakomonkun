import { redirect } from "next/navigation";
import { RoleShell } from "@/components/role-shell";
import { getCurrentUser } from "@/lib/auth";
import { toBoardActor } from "@/lib/board/permissions";
import { listBoardPosts } from "@/lib/board/read";
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

  const initial = await listBoardPosts(user.id, "all", null);

  return (
    <RoleShell roleName={user.role.name} userName={user.displayName}>
      <BoardFeed
        initialPosts={initial.posts}
        initialNextCursor={initial.nextCursor}
        viewer={{ ...actor, displayName: user.displayName }}
      />
    </RoleShell>
  );
}
