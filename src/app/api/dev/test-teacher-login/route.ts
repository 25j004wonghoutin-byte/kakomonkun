import { NextResponse } from "next/server";
import { DEV_AUTH_COOKIE, isDevTestAuthEnabled } from "@/lib/dev-auth";
import { badRequest, conflict, notFound, serverError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  normalizeDevTeacherAccount,
  TEACHER_DISPLAY_NAME,
} from "@/lib/teacher/identity";

type TestTeacherLoginBody = {
  account?: string;
};

export async function POST(request: Request) {
  if (!isDevTestAuthEnabled()) return notFound();

  let body: TestTeacherLoginBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const email = normalizeDevTeacherAccount(body.account ?? "");
  if (!email) {
    return badRequest("開発用教師ログインには test-teacher を入力してください。");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const teacherRole = await tx.role.findUnique({
        where: { name: "teacher" },
      });

      if (!teacherRole) return { kind: "missing-role" } as const;

      const existing = await tx.user.findUnique({
        where: { email },
        include: { role: true },
      });

      if (existing && existing.roleId !== teacherRole.id) {
        return { kind: "role-conflict" } as const;
      }

      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              displayName: TEACHER_DISPLAY_NAME,
              status: "active",
              deletedAt: null,
              lastLoginAt: new Date(),
            },
          })
        : await tx.user.create({
            data: {
              roleId: teacherRole.id,
              email,
              displayName: TEACHER_DISPLAY_NAME,
              status: "active",
              lastLoginAt: new Date(),
            },
          });

      await tx.teacherProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });

      return { kind: "ok", user } as const;
    });

    if (result.kind === "missing-role") return serverError();
    if (result.kind === "role-conflict") {
      return conflict("Test account email is already used by a non-teacher user");
    }

    const response = NextResponse.json({ next: "/teacher" });
    response.cookies.set(DEV_AUTH_COOKIE, result.user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (cause) {
    console.error("Test teacher login failed", cause);

    return Response.json(
      {
        error: isDatabaseAuthenticationError(cause)
          ? "データベース認証に失敗しました。.env の DATABASE_URL を確認してください。"
          : "教師テストログイン処理に失敗しました。サーバーログを確認してください。",
      },
      { status: 500 },
    );
  }
}

function isDatabaseAuthenticationError(cause: unknown) {
  if (!cause || typeof cause !== "object") return false;

  const error = cause as {
    code?: unknown;
    errorCode?: unknown;
    message?: unknown;
  };

  return (
    error.code === "P1000" ||
    error.errorCode === "P1000" ||
    (typeof error.message === "string" &&
      error.message.includes("Authentication failed against the database server"))
  );
}
