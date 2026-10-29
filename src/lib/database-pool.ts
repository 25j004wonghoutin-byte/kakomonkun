export function getDatabasePoolMax(env: Record<string, string | undefined> = process.env): number {
  const value = env.KAKOMON_DATABASE_POOL_MAX;
  if (value === undefined) return 2;
  const max = Number(value);
  if (!Number.isInteger(max) || max < 1 || max > 10 || String(max) !== value) {
    throw new Error("KAKOMON_DATABASE_POOL_MAX must be an integer from 1 to 10");
  }
  return max;
}
