import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadTestConfig, TEST_PROJECT_REF } from "./test-environment.mjs";
import { openAvatarMaintenance } from "./avatar-maintenance.mjs";

export async function checkAvatarStorage({ setup = false } = {}) {
  const config = loadTestConfig();
  if (config.TEST_SUPABASE_PROJECT_REF !== TEST_PROJECT_REF) throw new Error("Wrong test project");
  const input = { ...config, SUPABASE_SECRET_KEY: config.TEST_SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY: config.TEST_SUPABASE_SERVICE_ROLE_KEY };
  const resources = await openAvatarMaintenance(input);
  const secret = input.SUPABASE_SECRET_KEY || input.SUPABASE_SERVICE_ROLE_KEY;
  const client = createClient(config.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: {persistSession:false,autoRefreshToken:false} });
  try {
    const connection = await resources.db.$queryRaw`SELECT current_database() AS database`;
    let { data: bucket, error } = await client.storage.getBucket("student-avatars");
    if (error && !["404", "400"].includes(String(error.statusCode))) throw new Error("Cannot inspect test bucket");
    if (setup && !bucket) {
      const result = await client.storage.createBucket("student-avatars", { public:false, fileSizeLimit:2097152, allowedMimeTypes:["image/webp"] });
      if (result.error) throw new Error("Cannot create dedicated test bucket");
      ({data:bucket,error} = await client.storage.getBucket("student-avatars"));
      if (error) throw new Error("Cannot inspect created bucket");
    }
    const validBucket = !!bucket && bucket.public === false && Number(bucket.file_size_limit) === 2097152
      && bucket.allowed_mime_types?.length === 1 && bucket.allowed_mime_types[0] === "image/webp";
    if (bucket && !validBucket) throw new Error("Existing bucket configuration conflicts with the approved design; no overwrite performed");
    const policies = await resources.db.$queryRaw`SELECT policyname, permissive, roles::text AS roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'`;
    const existing = policies.find(row => row.policyname === "student_avatars_server_only");
    if (setup && !existing) {
      const sql = new TextDecoder("utf-8", {fatal:true}).decode(readFileSync(new URL("../supabase/avatar-storage-policy.sql", import.meta.url)));
      await resources.db.$executeRawUnsafe(sql);
    }
    const finalPolicies = await resources.db.$queryRaw`SELECT policyname, permissive, roles::text AS roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'student_avatars_server_only'`;
    const policy = finalPolicies[0];
    const validPolicy = !!policy && policy.permissive === "RESTRICTIVE" && policy.cmd === "ALL"
      && policy.roles.includes("anon") && policy.roles.includes("authenticated")
      && /bucket_id\s*<>\s*'student-avatars'/.test(policy.qual ?? "") && /bucket_id\s*<>\s*'student-avatars'/.test(policy.with_check ?? "");
    if (policy && !validPolicy) throw new Error("Existing avatar policy conflicts; no overwrite performed");
    const rows = await resources.db.studentProfile.findMany({ where:{avatarUrl:{not:null}},select:{avatarUrl:true} });
    const {parseAvatarUrl} = await import("../src/lib/avatars/contract.ts");
    const result = { project:TEST_PROJECT_REF, database:connection[0]?.database, bucketExists:!!bucket, validBucket, validPolicy,
      existingStoragePolicyCount:policies.length, currentManagedAvatarCount:rows.filter(row=>parseAvatarUrl(row.avatarUrl)).length,
      legacyAvatarCount:rows.filter(row=>!parseAvatarUrl(row.avatarUrl)).length };
    return result;
  } finally { await resources.db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {values} = parseArgs({options:{test:{type:"boolean"},"setup-test":{type:"boolean"}},strict:true,allowPositionals:false});
  if (!values.test || values["setup-test"] && !values.test) throw new Error("Explicit --test is required");
  checkAvatarStorage({setup:!!values["setup-test"]}).then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{
    console.error("Avatar test storage check failed. Verify dedicated test credentials, project and connectivity. Credentials are not logged.");process.exitCode=1;
  });
}
