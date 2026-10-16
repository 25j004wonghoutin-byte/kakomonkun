import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { TEST_PROJECT_REF, validateTestConfig } from "./test-environment.mjs";

export function validateAvatarMaintenanceConfig(input, projectRef) {
  const invalid = () => { throw new Error("Invalid avatar maintenance configuration; use an explicit matching project and env file"); };
  if (!/^[a-z]{20}$/.test(projectRef ?? "") || input.NEXT_PUBLIC_SUPABASE_URL !== `https://${projectRef}.supabase.co`) invalid();
  for (const [field, port] of [["DATABASE_URL", "6543"], ["DIRECT_URL", "5432"]]) {
    let url;
    try { url = new URL(input[field]); } catch { invalid(); }
    const name = decodeURIComponent(url.username);
    const target = url.hostname === `db.${projectRef}.supabase.co` && name === "postgres"
      || url.hostname.endsWith(".pooler.supabase.com") && name === `postgres.${projectRef}`;
    if (!target || !["postgres:","postgresql:"].includes(url.protocol) || url.port !== port || url.pathname !== "/postgres" || !url.password || url.search || url.hash) invalid();
  }
  if (projectRef === TEST_PROJECT_REF) {
    const config = validateTestConfig(input);
    return { ...config, SUPABASE_SECRET_KEY: config.TEST_SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY: config.TEST_SUPABASE_SERVICE_ROLE_KEY };
  }
  return input;
}

export function readAvatarMaintenanceConfig(envFile, projectRef) {
  if (!envFile || !isAbsolute(envFile)) throw new Error("Specify an absolute --env-file path");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(envFile));
  return validateAvatarMaintenanceConfig(parseEnv(text), projectRef);
}

export async function openAvatarMaintenance(config) {
  const [{ PrismaClient }, { PrismaPg }, { createAvatarStorage }, { getAvatarStorageConfig }, { createAvatarRepository }] = await Promise.all([
    import("../prisma/generated/client.ts"), import("@prisma/adapter-pg"), import("../src/lib/avatars/storage.ts"), import("../src/lib/avatars/storage-config.ts"), import("../src/lib/avatars/repository.ts"),
  ]);
  const storageConfig = getAvatarStorageConfig(config);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DIRECT_URL, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000, allowExitOnIdle: true, ssl: { rejectUnauthorized: false } }), errorFormat: "minimal" });
  return { db, repository: createAvatarRepository(db), storage: createAvatarStorage(storageConfig) };
}

async function main() {
  const { values } = parseArgs({ options: { "env-file": {type:"string"}, "project-ref": {type:"string"}, list: {type:"boolean"}, "delete-key": {type:"string"}, "confirm-project": {type:"string"} }, strict: true, allowPositionals: false });
  const config = readAvatarMaintenanceConfig(values["env-file"], values["project-ref"]);
  if (Boolean(values.list) === Boolean(values["delete-key"])) throw new Error("Choose --list or --delete-key for exactly one object");
  if (values["delete-key"] && values["confirm-project"] !== values["project-ref"]) throw new Error("Deletion requires --confirm-project matching --project-ref");
  const { parseAvatarKey } = await import("../src/lib/avatars/contract.ts");
  const ref = values["delete-key"] ? parseAvatarKey(values["delete-key"]) : null;
  if (values["delete-key"] && !ref) throw new Error("Deletion requires one canonical owner/version.webp key");
  const resources = await openAvatarMaintenance(config);
  try {
    const { listAvatarCleanupCandidates, cleanupAvatarObject } = await import("../src/lib/avatars/cleanup.ts");
    const input = { ...resources, now: new Date() };
    if (values.list) {
      const candidates = await listAvatarCleanupCandidates(input);
      console.log(JSON.stringify({project:values["project-ref"], mode:"read-only", candidates:candidates.map(item=>({key:item.ref.key,createdAt:item.createdAt.toISOString()}))},null,2));
    } else console.log(JSON.stringify({project:values["project-ref"],key:ref.key,result:await cleanupAvatarObject({...input,ref})}));
  } finally { await resources.db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Avatar maintenance did not complete. Verify the explicit project, configuration and connectivity; no credentials are logged."); process.exitCode=1; });
}
