import { MockError } from "./contract";

const TEST_PROJECT_REF = "grzylombpqmidltnbwhx";
const PRODUCTION_PROJECT_REF = "ckgoikdjhtklhbzdgxxs";

export type MockEnvironment = {
  enabled: boolean;
  startsEnabled: boolean;
  jobsEnabled: boolean;
  projectRef: string;
};

const configurationError = () => new MockError("mock_configuration", 503, "模擬試験の接続設定を確認してください。");

function supabaseMatches(raw: string | undefined, projectRef: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === `${projectRef}.supabase.co`
      && !url.port && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

function databaseMatches(raw: string | undefined, projectRef: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const username = decodeURIComponent(url.username);
    const direct = url.hostname === `db.${projectRef}.supabase.co` && username === "postgres";
    const pooler = url.hostname.endsWith(".pooler.supabase.com") && username === `postgres.${projectRef}`;
    return ["postgres:", "postgresql:"].includes(url.protocol) && (direct || pooler)
      && ["5432", "6543"].includes(url.port) && url.pathname === "/postgres"
      && Boolean(url.password) && !url.search && !url.hash;
  } catch { return false; }
}

/** 接続は行わない。停止時はDB設定すら参照せず、既存機能をそのまま動かす。 */
export function readMockEnvironment(env: NodeJS.ProcessEnv): MockEnvironment {
  if (env.KAKOMON_MOCK_ENABLED !== "true") {
    return { enabled: false, startsEnabled: false, jobsEnabled: false, projectRef: "" };
  }
  const projectRef = env.KAKOMON_MOCK_PROJECT_REF;
  if ((projectRef !== TEST_PROJECT_REF && projectRef !== PRODUCTION_PROJECT_REF)
    || (env.KAKOMON_TEST_ENV === "1" && projectRef !== TEST_PROJECT_REF)
    || !supabaseMatches(env.NEXT_PUBLIC_SUPABASE_URL, projectRef)
    || !databaseMatches(env.DATABASE_URL, projectRef)
    || !databaseMatches(env.DIRECT_URL, projectRef)) {
    throw configurationError();
  }
  return {
    enabled: true,
    startsEnabled: env.KAKOMON_MOCK_STARTS_ENABLED === "true",
    jobsEnabled: env.KAKOMON_MOCK_JOBS_ENABLED === "true",
    projectRef,
  };
}
