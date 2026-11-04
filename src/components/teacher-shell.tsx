import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";

export function TeacherShell({ children, userId }: { children: ReactNode; userId?: string }) {
  return (
    <RoleShell roleName="teacher" userName="管理者" userId={userId}>
      {children}
    </RoleShell>
  );
}
