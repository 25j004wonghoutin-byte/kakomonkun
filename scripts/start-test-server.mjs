import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import pg from "pg";
import { buildTestProcessEnv, loadTestConfig, PROJECT_ROOT, TEST_PROJECT_REF } from "./test-environment.mjs";

try {
  const config = loadTestConfig();
  const client = new pg.Client({ connectionString: config.DIRECT_URL, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await client.query("SELECT count(*)::int AS count FROM public.titles WHERE catalog_key IS NOT NULL");
    if (result.rows[0].count !== 66) throw new Error("Test database master data is not ready");
    await client.query("ROLLBACK");
  } finally { await client.end(); }
  console.log(`Verified test database: ${TEST_PROJECT_REF}`);
  if (!process.argv.includes("--check")) {
    const require = createRequire(import.meta.url);
    const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3001"], {
      cwd: PROJECT_ROOT, env: buildTestProcessEnv(config), stdio: "inherit", windowsHide: true,
    });
    child.on("error", () => { console.error("Test server could not start"); process.exitCode = 1; });
    child.on("exit", (code) => { process.exitCode = code ?? 1; });
  }
} catch (error) {
  console.error("Test server stopped before startup. Check test configuration / schema.");
  if (typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)) console.error(`Error code: ${error.code}`);
  process.exitCode = 1;
}
