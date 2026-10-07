import assert from "node:assert/strict";
import test from "node:test";
import { loadTestConfig } from "../scripts/test-environment.mjs";

// Opt in explicitly; this test never falls back to the production environment.
test("a queued transaction survives a four-second single-connection contention", {
  skip: process.env.KAKOMON_RUN_DB_QA !== "1",
  timeout: 30_000,
}, async () => {
  const config = loadTestConfig();
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = config.DATABASE_URL;
  let prisma;
  try {
    ({ prisma } = await import("../src/lib/prisma.ts"));
    let signalReady;
    const ready = new Promise((resolve) => { signalReady = resolve; });
    const holding = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS value`;
      signalReady();
      await tx.$queryRaw`SELECT 1 AS value FROM pg_sleep(4)`;
      return "released";
    }, { timeout: 15_000 });
    // Also unblock the test if opening the first connection fails.
    holding.catch(() => signalReady());
    await ready;
    const queued = prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`SELECT 1 AS value`;
      return rows[0].value;
    }, { timeout: 15_000 });
    const results = await Promise.allSettled([holding, queued]);
    for (const result of results) {
      assert.equal(result.status, "fulfilled", result.reason?.message);
    }
    assert.equal(results[0].value, "released");
    assert.equal(results[1].value, 1);
  } finally {
    await prisma?.$disconnect();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (globalThis.prisma === prisma) delete globalThis.prisma;
  }
});
