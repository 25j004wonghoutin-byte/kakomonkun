import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTeacherAccountConfig,
  teacherAuthEmailForAccount,
} from "../scripts/lib/teacher-account.mjs";
import { runDatabaseDryRun } from "../scripts/lib/provision-teacher-core.mjs";

test("teacher account config accepts NAME and PASSWORD only", () => {
  assert.deepEqual(
    parseTeacherAccountConfig({
      TEACHER_ACCOUNT_NAME: " Teacher.Admin ",
      TEACHER_ACCOUNT_PASSWORD: "long-password",
    }),
    {
      name: "teacher.admin",
      password: "long-password",
      email: "teacher.admin@teacher.local",
    },
  );
});

test("teacher account config rejects missing or unsafe values", () => {
  assert.throws(
    () =>
      parseTeacherAccountConfig({
        TEACHER_ACCOUNT_NAME: "teacher@example.com",
        TEACHER_ACCOUNT_PASSWORD: "long-password",
      }),
    /TEACHER_ACCOUNT_NAME/,
  );
  assert.throws(
    () =>
      parseTeacherAccountConfig({
        TEACHER_ACCOUNT_NAME: "teacher",
        TEACHER_ACCOUNT_PASSWORD: "short",
      }),
    /TEACHER_ACCOUNT_PASSWORD/,
  );
  assert.equal(teacherAuthEmailForAccount("管理者"), null);
});

test("teacher provisioning dry-run checks the resolved Auth UUID and rolls back", async () => {
  const calls = [];
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql: String(sql).trim(), parameters });
      if (String(sql).includes("SELECT id FROM users WHERE auth_user_id")) {
        return { rowCount: 0, rows: [] };
      }
      if (String(sql).includes("RETURNING id")) {
        return { rowCount: 1, rows: [{ id: "teacher-user" }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  await runDatabaseDryRun(
    database,
    {
      roleId: "teacher-role",
      teacherUser: { id: "teacher-user", auth_user_id: null },
    },
    "teacher@teacher.local",
    "resolved-auth-id",
  );

  assert.equal(calls[0].sql, "BEGIN");
  assert.match(calls[1].sql, /SELECT id FROM users WHERE auth_user_id/);
  assert.equal(calls[1].parameters[0], "resolved-auth-id");
  assert.equal(calls.at(-1).sql, "ROLLBACK");
});

test("teacher provisioning rejects an Auth UUID linked to another app user", async () => {
  const database = {
    async query(sql) {
      if (String(sql).includes("SELECT id FROM users WHERE auth_user_id")) {
        return { rowCount: 1, rows: [{ id: "different-user" }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  await assert.rejects(
    runDatabaseDryRun(
      database,
      {
        roleId: "teacher-role",
        teacherUser: { id: "teacher-user", auth_user_id: null },
      },
      "teacher@teacher.local",
      "resolved-auth-id",
    ),
    /already linked to another app user/,
  );
});
