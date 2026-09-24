import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const TEACHER_DISPLAY_NAME = "管理者";
const applyChanges = process.argv.includes("--apply");

class DryRunRollback extends Error {}

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

const directUrl = process.env.DIRECT_URL;
const teacherEmail = process.env.TEACHER_ACCOUNT_EMAIL?.trim().toLowerCase();

if (!directUrl) throw new Error("DIRECT_URL is required");
if (!teacherEmail) throw new Error("TEACHER_ACCOUNT_EMAIL is required");

const connectionHost = new URL(directUrl).hostname;
const pool = new Pool({
  connectionString: directUrl,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

console.log(`対象メール: ${teacherEmail}`);
console.log(`接続先ホスト: ${connectionHost}`);
console.log("変更予定: teacherロール、固定名「管理者」、active状態、教師プロフィールを設定");
console.log(applyChanges ? "実行モード: 適用" : "実行モード: ドライラン（ロールバック）");

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const teacherRole = await client.query(
    "SELECT id FROM roles WHERE name = $1 LIMIT 1",
    ["teacher"],
  );
  if (!teacherRole.rowCount) throw new Error("Teacher role is not configured");

  const existing = await client.query(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [teacherEmail],
  );
  const roleId = teacherRole.rows[0].id;
  const user = await client.query(
    `
      INSERT INTO users (role_id, email, display_name, status, updated_at)
      VALUES ($1, $2, $3, 'active', now())
      ON CONFLICT (email) DO UPDATE SET
        role_id = EXCLUDED.role_id,
        display_name = EXCLUDED.display_name,
        status = 'active',
        deleted_at = NULL,
        updated_at = now()
      RETURNING id
    `,
    [roleId, teacherEmail, TEACHER_DISPLAY_NAME],
  );

  await client.query(
    `
      INSERT INTO teacher_profiles (user_id, updated_at)
      VALUES ($1, now())
      ON CONFLICT (user_id) DO NOTHING
    `,
    [user.rows[0].id],
  );

  console.log(
    existing.rowCount
      ? "対象ユーザーを更新します。"
      : "対象ユーザーを新規作成します。",
  );
  console.log("パスワードとSupabase Authユーザーは作成しません。");

  if (!applyChanges) throw new DryRunRollback();

  await client.query("COMMIT");
  console.log("教師アカウントの準備を完了しました。");
} catch (cause) {
  await client.query("ROLLBACK");

  if (cause instanceof DryRunRollback) {
    console.log("ドライランを完了し、すべての変更をロールバックしました。");
  } else {
    throw cause;
  }
} finally {
  client.release();
  await pool.end();
}
