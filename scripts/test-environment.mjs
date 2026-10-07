import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const TEST_PROJECT_REF = "grzylombpqmidltnbwhx";
export const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));

export function validateTestConfig(input) {
  const invalid = (field) => { throw new Error(`Invalid test configuration: ${field}`); };
  if (input.TEST_SUPABASE_PROJECT_REF !== TEST_PROJECT_REF) invalid("TEST_SUPABASE_PROJECT_REF");
  if (input.NEXT_PUBLIC_SUPABASE_URL !== `https://${TEST_PROJECT_REF}.supabase.co`) invalid("NEXT_PUBLIC_SUPABASE_URL");
  for (const [field, port] of [["DATABASE_URL", "6543"], ["DIRECT_URL", "5432"]]) {
    let url;
    try { url = new URL(input[field]); } catch { invalid(field); }
    const username = decodeURIComponent(url.username);
    const target = (url.hostname === `db.${TEST_PROJECT_REF}.supabase.co` && username === "postgres")
      || (url.hostname.endsWith(".pooler.supabase.com") && username === `postgres.${TEST_PROJECT_REF}`);
    // 接続オプションによるホスト・認証情報の上書きを防ぐため、クエリは許可しない。
    if (!target || !["postgres:", "postgresql:"].includes(url.protocol) || url.port !== port
      || url.pathname !== "/postgres" || !url.password || url.search || url.hash || /YOUR[-_ ]?PASSWORD/i.test(url.password)) invalid(field);
  }
  const key = input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || input.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let publicKey = typeof key === "string" && key.startsWith("sb_publishable_");
  if (!publicKey && typeof key === "string") {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
      publicKey = payload.role === "anon" && payload.ref === TEST_PROJECT_REF;
    } catch { /* Reject malformed or privileged keys without logging the value. */ }
  }
  if (!publicKey) invalid("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return {
    TEST_SUPABASE_PROJECT_REF: TEST_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    DATABASE_URL: input.DATABASE_URL,
    DIRECT_URL: input.DIRECT_URL,
  };
}

export function loadTestConfig() {
  let input;
  try {
    const bytes = readFileSync(new URL("../.env.test.local", import.meta.url));
    input = parseEnv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw new Error("Cannot read UTF-8 .env.test.local; no fallback configuration is used"); }
  return validateTestConfig(input);
}

export function buildTestProcessEnv(input, base = process.env) {
  const config = validateTestConfig(input);
  const env = { ...base };
  for (const name of Object.keys(env)) {
    if (/^(?:SUPABASE_|NEXT_PUBLIC_SUPABASE_|TEACHER_|GEMINI_|KAKOMON_SEED_)/.test(name)) env[name] = "";
  }
  return {
    ...env, ...config, NODE_ENV: "development", KAKOMON_TEST_ENV: "1",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_SECRET_KEY: "",
    TEACHER_ACCOUNT_NAME: "test-teacher", GEMINI_API_KEY: "", GEMINI_MODEL: "",
  };
}

export function assertEmptyTestDatabase(tableCount) {
  if (tableCount !== 0) throw new Error("Test database is not empty; setup refuses to overwrite or reset it");
}
