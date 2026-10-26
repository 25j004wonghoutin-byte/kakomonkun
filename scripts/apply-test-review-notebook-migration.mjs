import { readFileSync } from "node:fs";
import { PrismaClient } from "../prisma/generated/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadTestConfig, TEST_PROJECT_REF } from "./test-environment.mjs";
import { applyReviewNotebookMigration } from "./lib/review-notebook-migration.mjs";

let db;
try {
  const config = loadTestConfig();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DIRECT_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000, allowExitOnIdle: true }), errorFormat: "minimal" });
  const sql = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL("../supabase/migrations/20261026000000_review_notebook.sql", import.meta.url)));
  console.log(JSON.stringify({ project: TEST_PROJECT_REF, ...await applyReviewNotebookMigration(db, sql) }));
} catch (error) {
  console.error("Test review migration stopped; no reset or production fallback attempted.");
  if (typeof error.code === "string" && /^[A-Za-z0-9_]+$/.test(error.code)) console.error(`Code: ${error.code}`);
  process.exitCode = 1;
} finally { if (db) await db.$disconnect(); }
