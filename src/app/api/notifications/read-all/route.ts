import { getCurrentUser } from "@/lib/auth";
import { createNotificationReadAllHandler } from "@/lib/notifications/read-all-handler";
import { markAllNotificationsRead } from "@/lib/notifications/write";

export const PATCH = createNotificationReadAllHandler({
  getUser: getCurrentUser,
  markAllRead: markAllNotificationsRead,
});
