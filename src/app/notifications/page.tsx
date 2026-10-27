import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { TeacherShell } from "@/components/teacher-shell";
import { getCurrentUser } from "@/lib/auth";
import {
  getUnreadNotificationCount,
  listNotifications,
} from "@/lib/notifications/read";
import { isTeacherRole } from "@/lib/teacher/identity";
import { NotificationList } from "./notification-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const teacher = isTeacherRole(user.role.name);
  if (!teacher && user.role.name !== "student") redirect("/");

  const [page, unreadCount] = await Promise.all([
    listNotifications(user.id, null),
    getUnreadNotificationCount(user.id),
  ]);

  const content = (
    <div className="mx-auto w-full max-w-[960px]">
      <div className="mb-5">
        <h1 className="text-3xl font-black text-[#242823]">通知</h1>
      </div>

      <NotificationList
        initialNotifications={page.notifications}
        initialNextCursor={page.nextCursor}
        initialUnreadCount={unreadCount}
      />
    </div>
  );

  return teacher ? (
    <TeacherShell>{content}</TeacherShell>
  ) : (
    <StudentShell userName={user.displayName}>{content}</StudentShell>
  );
}
