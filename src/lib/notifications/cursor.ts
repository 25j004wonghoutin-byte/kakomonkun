export type NotificationCursor = {
  createdAt: string;
  id: string;
};

const CURSOR_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeNotificationCursor(value: NotificationCursor): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function parseNotificationCursor(
  text: string,
): NotificationCursor | null {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(text, "base64url").toString("utf8"),
    );

    if (!value || typeof value !== "object") {
      return null;
    }

    const row = value as Record<string, unknown>;
    if (
      typeof row.createdAt !== "string" ||
      !Number.isFinite(Date.parse(row.createdAt)) ||
      typeof row.id !== "string" ||
      !CURSOR_UUID_PATTERN.test(row.id)
    ) {
      return null;
    }

    return { createdAt: row.createdAt, id: row.id };
  } catch {
    return null;
  }
}
