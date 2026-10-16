import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = new URL("../scripts/check-avatar-storage.mjs", import.meta.url);
const loader = new URL("./helpers/register-title-tests.mjs", import.meta.url);

// Stub only external configuration/DB/Storage I/O. Run the real CLI and inspect
// its process exit status; removing its readiness guard must fail these tests.
function runPreflight({ bucketExists, policyExists }) {
  const bucket = bucketExists ? { public: false, file_size_limit: 2097152, allowed_mime_types: ["image/webp"] } : null;
  const policies = policyExists ? [{ policyname: "student_avatars_server_only", permissive: "RESTRICTIVE", cmd: "ALL", roles: "{anon,authenticated}", qual: "bucket_id <> 'student-avatars'", with_check: "bucket_id <> 'student-avatars'" }] : [];
  const modules = {
    "./test-environment.mjs": `export const TEST_PROJECT_REF = "grzylombpqmidltnbwhx"; export function loadTestConfig() { return { TEST_SUPABASE_PROJECT_REF: TEST_PROJECT_REF, NEXT_PUBLIC_SUPABASE_URL: "https://grzylombpqmidltnbwhx.supabase.co", TEST_SUPABASE_SECRET_KEY: "sb_secret_fixture" }; }`,
    "@supabase/supabase-js": `export function createClient() { return { storage: { getBucket: async () => ({ data: ${JSON.stringify(bucket)}, error: ${bucket ? "null" : '{statusCode:"404"}'} }) } }; }`,
    "./avatar-maintenance.mjs": `export async function openAvatarMaintenance() { return { db: { $queryRaw: async (parts) => parts.join("").includes("current_database") ? [{database:"postgres"}] : ${JSON.stringify(policies)}, studentProfile: {findMany: async () => []}, $disconnect: async () => {} } }; }`,
  };
  const bootstrap = `
    import { registerHooks } from "node:module";
    const scriptUrl = ${JSON.stringify(script.href)};
    const modules = ${JSON.stringify(modules)};
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (context.parentURL === scriptUrl && Object.hasOwn(modules, specifier)) {
        return { url: "data:text/javascript," + encodeURIComponent(modules[specifier]), shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }});
  `;
  const result = spawnSync(process.execPath, ["--import", loader.href, "--import", `data:text/javascript,${encodeURIComponent(bootstrap)}`, fileURLToPath(script), "--test"], {
    encoding: "utf8", timeout: 10000, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  return { status: result.status, diagnostic: JSON.parse(result.stdout) };
}

for (const [bucketExists, policyExists] of [[true, true], [false, true], [true, false], [false, false]]) {
  test(`storage preflight exits ${bucketExists && policyExists ? 0 : 1} with bucket=${bucketExists}, policy=${policyExists}`, () => {
    const { status, diagnostic } = runPreflight({ bucketExists, policyExists });
    assert.equal(diagnostic.validBucket, bucketExists);
    assert.equal(diagnostic.validPolicy, policyExists);
    assert.equal(status, bucketExists && policyExists ? 0 : 1);
  });
}
