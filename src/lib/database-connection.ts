import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions/db-connections";
import { getDatabasePoolMax } from "./database-pool";

export function createDatabasePool(
  connectionString: string,
  env: Record<string, string | undefined> = process.env,
): Pool {
  const pool = new Pool({
    connectionString,
    max: getDatabasePoolMax(env),
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  attachDatabasePool(pool);
  return pool;
}
