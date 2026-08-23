import { NextResponse } from "next/server";
import { DEV_AUTH_COOKIE, isDevTestAuthEnabled } from "@/lib/dev-auth";
import { badRequest, conflict, notFound, serverError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type TestStudentLoginBody = {
  account?: string;
};

export async function POST(request: Request) {
  try {
    return await handleTestStudentLogin(request);
  } catch (cause) {
    console.error("Test student login failed", cause);

    return Response.json(
      {
        error: isDatabaseAuthenticationError(cause)
          ? "データベース認証に失敗しました。.env の DATABASE_URL を確認してください。"
          : "テストログイン処理に失敗しました。サーバーログを確認してください。",
      },
      { status: 500 },
    );
  }
}

async function handleTestStudentLogin(request: Request) {
  if (!isDevTestAuthEnabled()) {
    return notFound();
  }

  let body: TestStudentLoginBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const account = body.account?.trim().toLowerCase();
  if (!account) return badRequest("account is required");

  const email = normalizeTestEmail(account);
  if (!email) {
    return badRequest("テストログインには test.local または example.com のアカウントを使ってください。");
  }

  const [studentRole, existing] = await Promise.all([
    prisma.role.findUnique({ where: { name: "student" } }),
    prisma.user.findUnique({
      where: { email },
      include: { role: true, studentProfile: true },
    }),
  ]);

  if (!studentRole) return serverError();

  if (existing && existing.role.name !== "student") {
    return conflict("Test account email is already used by a non-student user");
  }

  const user = await prisma.$transaction(async (tx) => {
    const displayName = getDisplayName(email);
    const appUser = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            displayName,
            status: "active",
            lastLoginAt: new Date(),
          },
          include: { role: true, studentProfile: true },
        })
      : await tx.user.create({
          data: {
            roleId: studentRole.id,
            email,
            displayName,
            status: "active",
            lastLoginAt: new Date(),
          },
          include: { role: true, studentProfile: true },
        });

    if (!appUser.studentProfile) {
      await tx.studentProfile.create({ data: { userId: appUser.id } });
    }

    return tx.user.findUniqueOrThrow({
      where: { id: appUser.id },
      include: { role: true, studentProfile: true },
    });
  });

  const response = NextResponse.json({
    next: "/practice",
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
  });

  response.cookies.set(DEV_AUTH_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}

function normalizeTestEmail(account: string) {
  const email = account.includes("@") ? account : `${account}@test.local`;

  if (email.endsWith("@test.local") || email.endsWith("@example.com")) {
    return email;
  }

  return null;
}

function getDisplayName(email: string) {
  const localPart = email.split("@")[0]?.trim();
  return localPart ? `テスト学生（${localPart.slice(0, 40)}）` : "テスト学生";
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
