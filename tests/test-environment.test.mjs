import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

let environment = {};
try { environment = await import("../scripts/test-environment.mjs"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const valid = () => ({
  TEST_SUPABASE_PROJECT_REF: "grzylombpqmidltnbwhx",
  NEXT_PUBLIC_SUPABASE_URL: "https://grzylombpqmidltnbwhx.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture",
  DATABASE_URL: "postgresql://postgres.grzylombpqmidltnbwhx:fixture@aws-0-test.pooler.supabase.com:6543/postgres",
  DIRECT_URL: "postgresql://postgres.grzylombpqmidltnbwhx:fixture@aws-0-test.pooler.supabase.com:5432/postgres",
});
function validate(value) {
  assert.equal(typeof environment.validateTestConfig, "function");
  return environment.validateTestConfig(value);
}

test("test guard accepts only the designated project and returns isolated settings", () => {
  const result = validate(valid());
  assert.equal(result.TEST_SUPABASE_PROJECT_REF, "grzylombpqmidltnbwhx");
  assert.equal(result.DATABASE_URL.includes("grzylombpqmidltnbwhx"), true);
});
for (const field of ["DATABASE_URL", "DIRECT_URL"]) {
  for (const [option, query] of [
    ["host", "host=db.ckgoikdjhtklhbzdgxxs.supabase.co"],
    ["user", "user=postgres"],
    ["port", "port=5432"],
    ["password", "password=DO_NOT_LOG_THIS"],
    ["database", "db=other"],
    ["encoded host", "ho%73t=db.ckgoikdjhtklhbzdgxxs.supabase.co"],
    ["combined overrides", "host=db.ckgoikdjhtklhbzdgxxs.supabase.co&user=postgres&port=5432&password=DO_NOT_LOG_THIS"],
  ]) {
    test(`test guard rejects ${field} with a ${option} query override`, () => {
      const input = valid();
      input[field] += `?${query}`;
      assert.throws(() => validate(input), (error) => {
        assert.equal(error.message, `Invalid test configuration: ${field}`);
        assert.equal(String(error).includes("DO_NOT_LOG_THIS"), false);
        return true;
      });
    });
  }
}
test("query-like characters encoded inside a password do not change the test destination", () => {
  const input = valid();
  for (const field of ["DATABASE_URL", "DIRECT_URL"]) {
    input[field] = input[field].replace(":fixture@", ":fixture%3Fhost%3Dproduction%26user%3Dpostgres@");
  }
  assert.doesNotThrow(() => validate(input));
});
test("test child environment rejects routing overrides before forwarding credentials", () => {
  const input = valid();
  input.DATABASE_URL += "?host=db.ckgoikdjhtklhbzdgxxs.supabase.co&user=postgres&port=5432";
  assert.throws(() => environment.buildTestProcessEnv(input), /Invalid test configuration: DATABASE_URL/);
});
for (const [name, replacement] of [
  ["TEST_SUPABASE_PROJECT_REF", "ckgoikdjhtklhbzdgxxs"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://ckgoikdjhtklhbzdgxxs.supabase.co"],
  ["DATABASE_URL", "postgresql://postgres.ckgoikdjhtklhbzdgxxs:fixture@aws-0-test.pooler.supabase.com:6543/postgres"],
  ["DIRECT_URL", "postgresql://postgres:fixture@db.ckgoikdjhtklhbzdgxxs.supabase.co:5432/postgres"],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_fixture"],
  ["DATABASE_URL", "postgresql://postgres.grzylombpqmidltnbwhx:fixture@untrusted.example:6543/postgres"],
  ["DIRECT_URL", "postgresql://postgres.grzylombpqmidltnbwhx:fixture@aws-0-test.pooler.supabase.com:6543/postgres"],
  ["DATABASE_URL", "postgresql://postgres.grzylombpqmidltnbwhx:fixture@aws-0-test.pooler.supabase.com:6543/other"],
  ["DATABASE_URL", ""],
]) {
  test(`test guard refuses invalid ${name}: ${replacement.split(":")[0] || "empty"}`, () => {
    assert.equal(typeof environment.validateTestConfig, "function");
    assert.throws(() => validate({ ...valid(), [name]: replacement }), /Invalid test configuration/);
  });
}
test("guard errors never reveal the connection password", () => {
  const input = valid();
  input.DATABASE_URL = "postgresql://postgres:DO_NOT_LOG_THIS@db.ckgoikdjhtklhbzdgxxs.supabase.co:5432/postgres";
  assert.equal(typeof environment.validateTestConfig, "function");
  assert.throws(() => validate(input), (error) => !String(error).includes("DO_NOT_LOG_THIS"));
});
test("child process uses test credentials rather than inherited production credentials", () => {
  assert.equal(typeof environment.buildTestProcessEnv, "function");
  const result = environment.buildTestProcessEnv(valid(), {
    PATH: "fixture-path", NODE_ENV: "production", DATABASE_URL: "production",
    DIRECT_URL: "production", NEXT_PUBLIC_SUPABASE_ANON_KEY: "production",
    SUPABASE_SERVICE_ROLE_KEY: "production", GEMINI_API_KEY: "production",
    TEACHER_ACCOUNT_NAME: "production", SUPABASE_SECRET_KEY: "production",
  });
  assert.equal(result.NODE_ENV, "development");
  assert.equal(result.PATH, "fixture-path");
  assert.equal(result.DATABASE_URL, valid().DATABASE_URL);
  assert.equal(result.DIRECT_URL, valid().DIRECT_URL);
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "GEMINI_API_KEY"]) assert.equal(result[key], "");
  assert.equal(result.TEACHER_ACCOUNT_NAME, "test-teacher");
  assert.equal(result.KAKOMON_TEST_ENV, "1");
});
test("setup refuses every nonempty public schema, without deleting data", () => {
  assert.equal(typeof environment.assertEmptyTestDatabase, "function");
  assert.doesNotThrow(() => environment.assertEmptyTestDatabase(0));
  for (const count of [1, 30, null, undefined, -1]) assert.throws(() => environment.assertEmptyTestDatabase(count), /not empty/);
});

function readNextConfig(testMode) {
  const url = new URL("../next.config.ts", import.meta.url);
  const exports = {};
  const source = ts.transpileModule(readFileSync(url, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, require: createRequire(url), __dirname: fileURLToPath(new URL("../", import.meta.url)), process: { env: { KAKOMON_TEST_ENV: testMode } } });
  return exports.default;
}
test("test and regular dev builds use separate output directories", () => {
  assert.equal(readNextConfig("1").distDir, "coverage/next-test");
  assert.equal(readNextConfig(undefined).distDir ?? ".next", ".next");
});
