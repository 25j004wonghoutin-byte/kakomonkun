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
        <p className="text-xs font-black tracking-[0.18em] text-blue-600">
          NOTIFICATIONS
        </p>
        <h1 className="mt-2 text-3xl font-black text-[#071d36]">通知</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
          掲示板への返信や、新しいお知らせを確認できます。
        </p>
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
