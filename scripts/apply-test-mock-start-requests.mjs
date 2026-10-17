import { readFileSync } from "node:fs";
import { PrismaClient } from "../prisma/generated/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadTestConfig, TEST_PROJECT_REF } from "./test-environment.mjs";
import { applyMockStartRequestsMigration } from "./lib/mock-migration.mjs";

let db;
try {
  const config=loadTestConfig();
  db=new PrismaClient({adapter:new PrismaPg({connectionString:config.DIRECT_URL,ssl:{rejectUnauthorized:false},max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000,allowExitOnIdle:true}),errorFormat:"minimal"});
  const sql=new TextDecoder("utf-8",{fatal:true}).decode(readFileSync(new URL("../supabase/migrations/20261017000000_mock_attempt_start_requests.sql",import.meta.url)));
  console.log(JSON.stringify({project:TEST_PROJECT_REF,...await applyMockStartRequestsMigration(db,sql)}));
} catch(e) {
  console.error("Test start identity migration stopped. No reset or production fallback is attempted.");
  if(typeof e.code==="string"&&/^[A-Za-z0-9_]+$/.test(e.code))console.error(`Code: ${e.code}`);
  process.exitCode=1;
} finally {if(db)await db.$disconnect();}
