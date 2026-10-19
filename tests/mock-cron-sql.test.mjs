import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import test from "node:test";

const postgresCode = error => error.meta?.driverAdapterError?.cause?.originalCode;

// pg_net serializes its fixed JSONB argument as body::text before UTF-8 encoding.
// A compact-only guard would reject all real scheduled requests despite a valid HMAC.
test("the exact pg_net JSONB tick body verifies without weakening the raw-byte signature", async () => {
  const { verifyMockJobRequest: verify } = await import("../src/lib/mock-exams/job-auth.ts");
  const config = { secret: "ephemeral-pg-net-fixture-0123456789", projectRef: "grzylombpqmidltnbwhx", environment: "test" };
  const now = new Date("2050-01-20T00:00:00Z"), time = String(Math.floor(+now / 1000));
  const body = '{"action": "tick"}';
  const request = (raw = body, signed = raw, nonce = randomUUID()) => new Request("https://app.example/api/internal/mock-exams/tick", {
    method: "POST", body: raw, headers: {
      "content-type": "application/json", "x-mock-time": time, "x-mock-nonce": nonce,
      "x-mock-project": config.projectRef, "x-mock-environment": config.environment,
      "x-mock-signature": createHmac("sha256", config.secret).update(`POST\n/api/internal/mock-exams/tick\n${config.projectRef}\ntest\n${time}\n${nonce}\n${createHash("sha256").update(signed).digest("hex")}`).digest("hex"),
    },
  });
  const nonce = randomUUID();
  assert.deepEqual(await verify(request(body, body, nonce), config, now), { nonce });
  await assert.rejects(verify(request(body, '{"action":"tick"}'), config, now), error => error.status === 401);
  await assert.rejects(verify(request('{"action": "other"}'), config, now), error => error.status === 401);
  await assert.rejects(verify(request(), config, new Date(+now + 61000)), error => error.status === 401);
});

test("installed private scheduler has no public signer and SQL signatures match Node without sending HTTP", {
  skip: process.env.KAKOMON_RUN_MOCK_CRON_DB_QA !== "1", timeout: 180000,
}, async () => {
  const { PrismaClient } = await import("../prisma/generated/client.ts");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { loadTestConfig } = await import("../scripts/test-environment.mjs");
  const config = loadTestConfig();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DIRECT_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000, allowExitOnIdle: true }), errorFormat: "minimal" });
  // Do not install or enable anything in the test: that is a separate, approved operation.
  try {
    await db.$transaction(async tx => {
      const functions = await tx.$queryRaw`SELECT p.proname, p.pronargs::int, p.prosecdef, p.proconfig, r.rolname AS owner
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE n.nspname='mock_exam_private' ORDER BY p.proname`;
      assert.deepEqual(functions.map(row => row.proname), ["cleanup_run_details", "dispatch_tick"]);
      assert.ok(functions.every(row => row.pronargs === 0 && row.prosecdef && row.owner === "postgres" && row.proconfig.includes("search_path=pg_catalog")));
      for (const role of ["anon", "authenticated"]) {
        const [privilege] = await tx.$queryRaw`SELECT has_schema_privilege(${role},'mock_exam_private','USAGE') AS schema_access,
          has_function_privilege(${role},'mock_exam_private.dispatch_tick()','EXECUTE') AS signer_access,
          has_function_privilege(${role},'mock_exam_private.cleanup_run_details()','EXECUTE') AS cleanup_access,
          has_table_privilege(${role},'vault.decrypted_secrets','SELECT') AS vault_access`;
        assert.deepEqual(privilege, { schema_access: false, signer_access: false, cleanup_access: false, vault_access: false });
        await tx.$executeRawUnsafe("SAVEPOINT denied_role");
        try {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await assert.rejects(tx.$queryRawUnsafe("SELECT mock_exam_private.dispatch_tick()"), error => postgresCode(error) === "42501");
        } finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT denied_role"); }
      }
      const publicGrants = await tx.$queryRaw`SELECT p.proname FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE n.nspname='mock_exam_private' AND a.grantee=0 AND a.privilege_type='EXECUTE'`;
      assert.deepEqual(publicGrants, []);
      const foreignRunId = -Number.parseInt(randomUUID().slice(0, 8), 16) - 1;
      await tx.$executeRaw`INSERT INTO cron.job_run_details(jobid,runid,database,username,command,status,start_time,end_time)
        VALUES (${foreignRunId},${foreignRunId},current_database(),'postgres','scheduler-qa-unrelated-history','succeeded',clock_timestamp()-interval '20 days',clock_timestamp()-interval '20 days')`;
      assert.equal((await tx.$queryRaw`SELECT mock_exam_private.cleanup_run_details() AS deleted`)[0].deleted, 0n);
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM cron.job_run_details WHERE runid=${foreignRunId}`)[0].count, 1);
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM cron.job WHERE jobname='kakomonkun-monthly-mock-tick'`)[0].count, 0);
      const definitions = await tx.$queryRaw`SELECT pg_get_functiondef('mock_exam_private.dispatch_tick()'::regprocedure) AS definition`;
      // This is a credential-leak check on the installed artifact, not a substitute for behavior tests.
      assert.ok(!definitions[0].definition.includes("sb_secret_") && !definitions[0].definition.includes("Bearer "));
      const existing = await tx.$queryRaw`SELECT count(*)::int AS count FROM vault.secrets WHERE name IN ('mock_exam_job_secret','mock_exam_tick_url','mock_exam_project_ref','mock_exam_environment')`;
      assert.equal(existing[0].count, 0, "fixture refuses existing scheduler Vault settings");
      await tx.$executeRawUnsafe("SAVEPOINT missing_settings");
      try {
        await assert.rejects(tx.$queryRawUnsafe("SELECT mock_exam_private.dispatch_tick()"), error => postgresCode(error) === "22023");
      } finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT missing_settings"); }
      const secret = `ephemeral-${randomUUID()}-${randomUUID()}`;
      const settingIds = new Map();
      for (const [name, value] of [["mock_exam_job_secret", secret], ["mock_exam_tick_url", "https://mock-test.example.invalid/api/internal/mock-exams/tick"], ["mock_exam_project_ref", "grzylombpqmidltnbwhx"], ["mock_exam_environment", "test"]]) {
        const [created] = await tx.$queryRaw`SELECT vault.create_secret(${value},${name},'transaction-only scheduler QA') AS id`;
        settingIds.set(name, created.id);
      }
      const [{ id }] = await tx.$queryRaw`SELECT mock_exam_private.dispatch_tick() AS id`;
      const [queued] = await tx.$queryRaw`SELECT method,url,headers,convert_from(body,'UTF8') AS body FROM net.http_request_queue WHERE id=${id}`;
      assert.equal(queued.method, "POST");
      assert.equal(queued.url, "https://mock-test.example.invalid/api/internal/mock-exams/tick");
      assert.equal(queued.body, '{"action": "tick"}');
      assert.ok(!JSON.stringify(queued).includes(secret));
      assert.deepEqual(Object.keys(queued.headers).map(key => key.toLowerCase()).sort(), ["content-type", "x-mock-environment", "x-mock-nonce", "x-mock-project", "x-mock-signature", "x-mock-time"]);
      const { verifyMockJobRequest: verify } = await import("../src/lib/mock-exams/job-auth.ts");
      const jobConfig = { secret, projectRef: "grzylombpqmidltnbwhx", environment: "test" };
      const received = new Date(Number(queued.headers["x-mock-time"]) * 1000);
      assert.deepEqual(await verify(new Request(queued.url, { method: queued.method, headers: queued.headers, body: queued.body }), jobConfig, received), { nonce: queued.headers["x-mock-nonce"] });
      await assert.rejects(verify(new Request(queued.url, { method: queued.method, headers: queued.headers, body: queued.body }), jobConfig, new Date(+received + 61000)), error => error.status === 401);
      for (const length of [32, 256]) {
        const boundarySecret = "a".repeat(length);
        await tx.$queryRaw`SELECT vault.update_secret(${settingIds.get("mock_exam_job_secret")}::uuid,${boundarySecret})::text`;
        const [{ id: boundaryId }] = await tx.$queryRaw`SELECT mock_exam_private.dispatch_tick() AS id`;
        const [boundary] = await tx.$queryRaw`SELECT url,headers,convert_from(body,'UTF8') AS body FROM net.http_request_queue WHERE id=${boundaryId}`;
        assert.ok((await verify(new Request(boundary.url, { method: "POST", headers: boundary.headers, body: boundary.body }), { ...jobConfig, secret: boundarySecret }, new Date(Number(boundary.headers["x-mock-time"]) * 1000))).nonce);
        assert.equal(await tx.$executeRaw`DELETE FROM net.http_request_queue WHERE id=${boundaryId}`, 1);
      }
      for (const [name, value] of [["mock_exam_environment", "production"], ["mock_exam_tick_url", "https://mock-test.example.invalid/api/internal/mock-exams/tick?override=1"], ["mock_exam_tick_url", "https://localhost/api/internal/mock-exams/tick"], ["mock_exam_job_secret", "a".repeat(31)], ["mock_exam_job_secret", "a".repeat(257)], ["mock_exam_job_secret", "a".repeat(31) + "!"]]) {
        await tx.$executeRawUnsafe("SAVEPOINT invalid_setting");
        try {
          await tx.$queryRaw`SELECT vault.update_secret(${settingIds.get(name)}::uuid,${value})::text`;
          await assert.rejects(tx.$queryRawUnsafe("SELECT mock_exam_private.dispatch_tick()"), error => postgresCode(error) === "22023");
        } finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_setting"); }
      }
      assert.equal(await tx.$executeRaw`DELETE FROM net.http_request_queue WHERE id=${id}`, 1);
      // pg_net only sends after COMMIT. Roll back secrets AND request queue together.
      throw Object.assign(new Error("scheduler_fixture_rollback"), { fixtureRollback: true });
    }, { maxWait: 10000, timeout: 60000 }).catch(error => { if (!error.fixtureRollback) throw error; });
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS count FROM vault.secrets WHERE name IN ('mock_exam_job_secret','mock_exam_tick_url','mock_exam_project_ref','mock_exam_environment')`)[0].count, 0);
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS count FROM net.http_request_queue WHERE url='https://mock-test.example.invalid/api/internal/mock-exams/tick'`)[0].count, 0);
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS count FROM cron.job`)[0].count, 0);
  } finally { await db.$disconnect(); }
});
