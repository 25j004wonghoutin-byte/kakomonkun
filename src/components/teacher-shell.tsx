import type { ReactNode } from "react";
import { RoleShell, type RoleNavigationItem } from "@/components/role-shell";

const teacherNavigation: RoleNavigationItem[] = [
  { label: "教師ホーム", href: "/teacher", icon: "home" },
  { label: "学習状況", href: "/teacher/students", icon: "students" },
  { label: "掲示板", href: "/board", icon: "message" },
  { label: "通知", href: "/notifications", icon: "bell" },
];

export function TeacherShell({ children }: { children: ReactNode }) {
  return (
    <RoleShell navigation={teacherNavigation} userName="管理者" avatarLabel="管">
      {children}
    </RoleShell>
  );
}
