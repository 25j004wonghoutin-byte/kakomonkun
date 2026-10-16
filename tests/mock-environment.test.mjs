import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const moduleUrl = new URL("../src/lib/mock-exams/environment.ts", import.meta.url);
const environment = async () => {
  assert.ok(existsSync(moduleUrl), "mock exam environment guard implementation is required");
  return import(moduleUrl.href);
};

const TEST_REF = "grzylombpqmidltnbwhx";
const PROD_REF = "ckgoikdjhtklhbzdgxxs";
const config = (ref = TEST_REF) => ({
  KAKOMON_MOCK_ENABLED: "true",
  KAKOMON_MOCK_STARTS_ENABLED: "true",
  KAKOMON_MOCK_JOBS_ENABLED: "true",
  KAKOMON_MOCK_PROJECT_REF: ref,
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  DATABASE_URL: `postgresql://postgres.${ref}:DO_NOT_LOG@aws-0-test.pooler.supabase.com:6543/postgres`,
  DIRECT_URL: `postgresql://postgres.${ref}:DO_NOT_LOG@aws-0-test.pooler.supabase.com:5432/postgres`,
});

test("unconfigured feature is stopped without inspecting a database or connecting", async () => {
  const { readMockEnvironment } = await environment();
  const env = new Proxy({}, { get: (_target, name) => {
    if (String(name).startsWith("KAKOMON_MOCK_")) return undefined;
    throw new Error("disabled feature must not inspect external configuration");
  } });
  assert.deepEqual(readMockEnvironment(env), { enabled: false, startsEnabled: false, jobsEnabled: false, projectRef: "" });
});

test("only exact true enables the feature and a master stop overrides subordinate switches", async () => {
  const { readMockEnvironment } = await environment();
  for (const value of [undefined, "false", "1", "TRUE", " true", "true "]) {
    const env = { KAKOMON_MOCK_ENABLED: value, KAKOMON_MOCK_STARTS_ENABLED: "true", KAKOMON_MOCK_JOBS_ENABLED: "true" };
    assert.deepEqual(readMockEnvironment(env), { enabled: false, startsEnabled: false, jobsEnabled: false, projectRef: "" });
  }
});

test("explicit matching test and production connections can be enabled independently", async () => {
  const { readMockEnvironment } = await environment();
  for (const ref of [TEST_REF, PROD_REF]) {
    assert.deepEqual(readMockEnvironment(config(ref)), { enabled: true, startsEnabled: true, jobsEnabled: true, projectRef: ref });
    assert.deepEqual(readMockEnvironment({ ...config(ref), KAKOMON_MOCK_STARTS_ENABLED: "false", KAKOMON_MOCK_JOBS_ENABLED: undefined }), { enabled: true, startsEnabled: false, jobsEnabled: false, projectRef: ref });
  }
});

test("matching direct database hosts are accepted without a pooler username", async () => {
  const { readMockEnvironment } = await environment();
  const env = { ...config(), DATABASE_URL: `postgresql://postgres:DO_NOT_LOG@db.${TEST_REF}.supabase.co:5432/postgres`, DIRECT_URL: `postgresql://postgres:DO_NOT_LOG@db.${TEST_REF}.supabase.co:5432/postgres` };
  assert.equal(readMockEnvironment(env).projectRef, TEST_REF);
});

test("a dedicated test process cannot enable production even with internally matching credentials", async () => {
  const { readMockEnvironment } = await environment();
  assert.throws(() => readMockEnvironment({ ...config(PROD_REF), KAKOMON_TEST_ENV: "1" }), (e) => e.status === 503);
  assert.equal(readMockEnvironment({ ...config(), KAKOMON_TEST_ENV: "1" }).enabled, true);
});

test("project mismatches and URL routing overrides are rejected without leaking secrets", async () => {
  const { readMockEnvironment } = await environment();
  const base = config();
  for (const replacement of [
    { KAKOMON_MOCK_PROJECT_REF: undefined },
    { KAKOMON_MOCK_PROJECT_REF: "unknownprojectrefxxxx" },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co.evil.invalid` },
    { NEXT_PUBLIC_SUPABASE_URL: `http://${TEST_REF}.supabase.co` },
    { NEXT_PUBLIC_SUPABASE_URL: `https://DO_NOT_LOG@${TEST_REF}.supabase.co` },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co/other` },
    { DATABASE_URL: config(PROD_REF).DATABASE_URL },
    { DIRECT_URL: config(PROD_REF).DIRECT_URL },
    { DATABASE_URL: base.DATABASE_URL.replace(".pooler.supabase.com", ".pooler.supabase.com.evil.invalid") },
    { DATABASE_URL: base.DATABASE_URL.replace(`postgres.${TEST_REF}`, "postgres") },
    { DIRECT_URL: undefined },
    { DATABASE_URL: `${base.DATABASE_URL}?host=db.${PROD_REF}.supabase.co` },
    { DATABASE_URL: `${base.DATABASE_URL}?ho%73t=db.${PROD_REF}.supabase.co` },
    { DIRECT_URL: `${base.DIRECT_URL}#DO_NOT_LOG` },
    { DATABASE_URL: base.DATABASE_URL.replace("/postgres", "/other") },
    { DATABASE_URL: base.DATABASE_URL.replace(":6543/", ":1234/") },
    { DATABASE_URL: base.DATABASE_URL.replace("postgresql:", "https:") },
    { DATABASE_URL: base.DATABASE_URL.replace("DO_NOT_LOG", "") },
  ]) {
    assert.throws(() => readMockEnvironment({ ...base, ...replacement }), (e) => {
      assert.equal(e.status, 503);
      assert.equal(String(e).includes("DO_NOT_LOG"), false);
      assert.equal(String(e).includes("postgresql://"), false);
      return true;
    });
  }
});

test("reading flags never mutates the supplied environment", async () => {
  const { readMockEnvironment } = await environment();
  const input = config();
  const before = structuredClone(input);
  readMockEnvironment(input);
  assert.deepEqual(input, before);
});
