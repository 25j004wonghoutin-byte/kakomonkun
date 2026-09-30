export function notificationReadWhere(
  recipientId: string,
  notificationId: string,
) {
  return { id: notificationId, recipientId };
}

export function notificationReadResult(
  notificationExists: boolean,
): "changed" | "not_found" {
  return notificationExists ? "changed" : "not_found";
}

export async function markNotificationRead(
  recipientId: string,
  notificationId: string,
): Promise<"changed" | "not_found"> {
  const { prisma } = await import("../prisma");
  const where = notificationReadWhere(recipientId, notificationId);
  const existing = await prisma.notification.findFirst({
    where,
    select: { id: true },
  });

  if (!existing) {
    return notificationReadResult(false);
  }

  await prisma.notification.updateMany({
    where: { ...where, readAt: null },
    data: { readAt: new Date() },
  });

  return notificationReadResult(true);
}
