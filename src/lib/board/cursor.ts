import type { BoardCursor, BoardScope } from "./contract";

const CURSOR_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeBoardCursor(
  scope: BoardScope,
  last: BoardCursor,
): string {
  const value =
    scope === "all"
      ? {
          isPinned: last.isPinned,
          createdAt: last.createdAt,
          id: last.id,
        }
      : { createdAt: last.createdAt, id: last.id };

  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeBoardCursor(
  scope: BoardScope,
  text: string,
): BoardCursor | null {
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

    if (scope === "all" && typeof row.isPinned !== "boolean") {
      return null;
    }

    return scope === "all"
      ? {
          isPinned: row.isPinned as boolean,
          createdAt: row.createdAt,
          id: row.id,
        }
      : { createdAt: row.createdAt, id: row.id };
  } catch {
    return null;
  }
}
