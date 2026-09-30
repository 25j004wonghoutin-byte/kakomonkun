import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import {
  applyDatabaseChanges,
  assertAuthUserLinkAvailable,
  runDatabaseDryRun,
} from "./lib/provision-teacher-core.mjs";
import { parseTeacherAccountConfig } from "./lib/teacher-account.mjs";

const TEACHER_DISPLAY_NAME = "管理者";
const applyChanges = process.argv.includes("--apply");

function loadEnvironmentFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const source = fs.readFileSync(filePath, "utf8");
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvironmentFile(".env");
loadEnvironmentFile(".env.local");
loadEnvironmentFile(".env.teacher.local");

const directUrl = process.env.DIRECT_URL;
if (!directUrl) throw new Error("DIRECT_URL is required");

const teacherAccount = parseTeacherAccountConfig(process.env);
const connectionHost = new URL(directUrl).hostname;
const pool = new Pool({
  connectionString: directUrl,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

console.log(`対象アカウント名: ${teacherAccount.name}`);
console.log(`接続先ホスト: ${connectionHost}`);
console.log("変更予定: Supabase AuthとアプリDBの共通教師アカウントを同期");
console.log(applyChanges ? "実行モード: 適用" : "実行モード: ドライラン（DB変更なし）");

const client = await pool.connect();

try {
  const plan = await loadProvisioningPlan(client, teacherAccount.email);
  const supabase = createSupabaseAdminClient();
  const existingAuthUser = await resolveSupabaseAuthUser(
    supabase,
    teacherAccount.email,
    plan.teacherUser?.auth_user_id ?? null,
  );

  await runDatabaseDryRun(
    client,
    plan,
    teacherAccount.email,
    existingAuthUser?.id ?? null,
  );

  if (!applyChanges) {
    console.log(
      plan.teacherUser
        ? "既存の共通教師ユーザーを更新する予定です。"
        : "共通教師ユーザーを新規作成する予定です。",
    );
    console.log("Supabase Authはドライランのため変更していません。");
  } else {
    const authUser = await upsertSupabaseAuthUser(
      supabase,
      teacherAccount,
      existingAuthUser,
    );
    await assertAuthUserLinkAvailable(
      client,
      authUser.id,
      plan.teacherUser?.id ?? null,
    );
    try {
      await applyDatabaseChanges(client, plan, teacherAccount.email, authUser.id);
    } catch (cause) {
      console.error(
        "アプリDBへの同期に失敗しました。Supabase Auth側は更新済みの可能性があります。",
      );
      throw cause;
    }
    console.log("教師アカウントの同期を完了しました。");
  }
} finally {
  client.release();
  await pool.end();
}

async function loadProvisioningPlan(database, targetEmail) {
  const teacherRole = await database.query(
    "SELECT id FROM roles WHERE name = $1 LIMIT 1",
    ["teacher"],
  );
  if (!teacherRole.rowCount) throw new Error("Teacher role is not configured");

  const targetUser = await database.query(
    `
      SELECT u.id, u.auth_user_id, u.email, r.name AS role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.email = $1
      LIMIT 1
    `,
    [targetEmail],
  );

  if (targetUser.rowCount && targetUser.rows[0].role_name !== "teacher") {
    throw new Error("The derived teacher email is already used by a non-teacher user");
  }

  const activeTeachers = await database.query(
    `
      SELECT u.id, u.auth_user_id, u.email
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'teacher' AND u.status = 'active' AND u.deleted_at IS NULL
      ORDER BY u.created_at ASC
    `,
  );

  const targetTeacher = targetUser.rowCount ? targetUser.rows[0] : null;
  if (!targetTeacher && activeTeachers.rowCount > 1) {
    throw new Error(
      "Multiple active teacher users exist. Choose the common account manually before provisioning.",
    );
  }

  return {
    roleId: teacherRole.rows[0].id,
    teacherUser: targetTeacher ?? activeTeachers.rows[0] ?? null,
  };
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function upsertSupabaseAuthUser(supabase, teacherAccount, authUser) {
  const attributes = {
    email: teacherAccount.email,
    password: teacherAccount.password,
    email_confirm: true,
    user_metadata: {
      account_name: teacherAccount.name,
      display_name: TEACHER_DISPLAY_NAME,
    },
  };

  if (authUser) {
    const result = await supabase.auth.admin.updateUserById(authUser.id, attributes);
    if (result.error) throw result.error;
    return result.data.user;
  }

  const result = await supabase.auth.admin.createUser(attributes);
  if (result.error) throw result.error;
  return result.data.user;
}

async function resolveSupabaseAuthUser(supabase, targetEmail, authUserId) {
  if (authUserId) {
    const result = await supabase.auth.admin.getUserById(authUserId);
    if (result.error) throw result.error;
    return result.data.user;
  }

  return findAuthUserByEmail(supabase, targetEmail);
}

async function findAuthUserByEmail(supabase, targetEmail) {
  for (let page = 1; ; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;

    const match = result.data.users.find(
      (user) => user.email?.toLowerCase() === targetEmail,
    );
    if (match) return match;
    if (result.data.users.length < 1000) return null;
  }
}
