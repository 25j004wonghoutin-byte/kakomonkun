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
