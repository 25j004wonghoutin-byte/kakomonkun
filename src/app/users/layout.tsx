import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";
import { getPublicProfileViewer } from "@/app/users/viewer";

export default async function UsersLayout({ children }: { children: ReactNode }) {
  const user = await getPublicProfileViewer();
  if (!user) redirect("/login");
  return <RoleShell roleName={user.role.name} userId={user.id} userName={user.displayName} avatarUrl={user.role.name === "student" ? user.studentProfile?.avatarUrl ?? null : null}>{children}</RoleShell>;
}
