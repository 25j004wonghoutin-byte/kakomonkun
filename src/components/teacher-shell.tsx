import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";

export function TeacherShell({ children }: { children: ReactNode }) {
  return (
    <RoleShell roleName="teacher" userName="管理者">
      {children}
    </RoleShell>
  );
}
