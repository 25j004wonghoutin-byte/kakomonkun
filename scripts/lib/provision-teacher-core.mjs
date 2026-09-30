const TEACHER_DISPLAY_NAME = "管理者";

export async function assertAuthUserLinkAvailable(
  database,
  authUserId,
  teacherUserId,
) {
  if (!authUserId) return;

  const linkedUser = await database.query(
    `
      SELECT id FROM users WHERE auth_user_id = $1
      AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1
    `,
    [authUserId, teacherUserId ?? null],
  );

  if (linkedUser.rowCount) {
    throw new Error("Supabase Auth user is already linked to another app user");
  }
}

export async function runDatabaseDryRun(
  database,
  plan,
  targetEmail,
  authUserId,
) {
  await database.query("BEGIN");
  try {
    await assertAuthUserLinkAvailable(
      database,
      authUserId,
      plan.teacherUser?.id ?? null,
    );
    await writeTeacherUser(database, plan, targetEmail, authUserId);
  } finally {
    await database.query("ROLLBACK");
  }
}

export async function applyDatabaseChanges(
  database,
  plan,
  targetEmail,
  authUserId,
) {
  await database.query("BEGIN");
  try {
    await assertAuthUserLinkAvailable(
      database,
      authUserId,
      plan.teacherUser?.id ?? null,
    );
    await writeTeacherUser(database, plan, targetEmail, authUserId);
    await database.query("COMMIT");
  } catch (cause) {
    await database.query("ROLLBACK");
    throw cause;
  }
}

async function writeTeacherUser(database, plan, targetEmail, authUserId) {
  const user = plan.teacherUser
    ? await database.query(
        `
          UPDATE users SET
            auth_user_id = $1,
            role_id = $2,
            email = $3,
            display_name = $4,
            status = 'active',
            deleted_at = NULL,
            updated_at = now()
          WHERE id = $5
          RETURNING id
        `,
        [
          authUserId,
          plan.roleId,
          targetEmail,
          TEACHER_DISPLAY_NAME,
          plan.teacherUser.id,
        ],
      )
    : await database.query(
        `
          INSERT INTO users (
            auth_user_id, role_id, email, display_name, status, updated_at
          )
          VALUES ($1, $2, $3, $4, 'active', now())
          RETURNING id
        `,
        [authUserId, plan.roleId, targetEmail, TEACHER_DISPLAY_NAME],
      );

  await database.query(
    `
      INSERT INTO teacher_profiles (user_id, updated_at)
      VALUES ($1, now())
      ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    `,
    [user.rows[0].id],
  );
}
