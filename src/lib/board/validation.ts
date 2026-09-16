const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBoardBody(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 280) {
    return null;
  }

  const body = value.trim();
  return body.length > 0 ? body : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseCreatePostPayload(
  value: unknown,
): { body: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(row, "isPinned")) {
    return null;
  }

  const body = parseBoardBody(row.body);
  return body === null ? null : { body };
}

export function parsePinPayload(
  value: unknown,
): { isPinned: boolean } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  return typeof row.isPinned === "boolean"
    ? { isPinned: row.isPinned }
    : null;
}
