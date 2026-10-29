import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { loadTestConfig } from "../scripts/test-environment.mjs";
import { getDatabasePoolMax } from "../src/lib/database-pool.ts";

test("twenty simultaneous read transactions complete with a bounded shared pool", {
  skip: process.env.KAKOMON_RUN_DB_QA !== "1", timeout: 120_000,
}, async t => {
  const config = loadTestConfig();
  const [{ PrismaClient }, { PrismaPg }, { createDatabasePool }] = await Promise.all([import("../prisma/generated/client.ts"), import("@prisma/adapter-pg"), import("../src/lib/database-connection.ts")]);
  for (const max of [1, getDatabasePoolMax({})]) {
    const pool = createDatabasePool(config.DATABASE_URL, { KAKOMON_DATABASE_POOL_MAX: String(max) });
    const db = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }), transactionOptions: { maxWait: 20_000 } });
    let active = 0, peak = 0;
    const durations = [];
    try {
      await db.$queryRaw`SELECT 1 AS value`;
      const start = performance.now();
      const results = await Promise.all(Array.from({ length: 20 }, async () => {
        const requested = performance.now();
        const value = await db.$transaction(async tx => {
          active++; peak = Math.max(peak, active);
          try { const rows = await tx.$queryRaw`SELECT 1 AS value FROM pg_sleep(0.02)`; return rows[0].value; }
          finally { active--; }
        }, { timeout: 10_000 });
        durations.push(performance.now() - requested);
        return value;
      }));
      assert.deepEqual(results, Array(20).fill(1));
      assert.ok(peak <= max);
      assert.equal(peak, max);
      const ordered = durations.sort((a,b) => a-b);
      t.diagnostic(JSON.stringify({ poolMax: max, operations: 20, completed: results.length, errors: 0, peakActiveTransactions: peak, elapsedMs: Math.round(performance.now() - start), p95Ms: Math.round(ordered[18]) }));
    } finally { await db.$disconnect(); assert.equal(pool.ended, true, "disconnect disposes the registered external pool"); }
  }
});
