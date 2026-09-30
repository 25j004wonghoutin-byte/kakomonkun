import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getConfiguredTeacherAccountName } from "@/lib/teacher/account-config";
import { authenticateTeacherLogin } from "@/lib/teacher/login";

export const runtime = "nodejs";

type TeacherLoginBody = {
  account?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  let body: TeacherLoginBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  }

  const configuredAccount = getConfiguredTeacherAccountName();
  const supabase = await createClient();
  const result = await authenticateTeacherLogin(body, {
    configuredAccount,
    async signIn(credentials) {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      return { userId: error ? null : (data.user?.id ?? null) };
    },
    async findAppUser(authUserId) {
      const appUser = await prisma.user.findUnique({
        where: { authUserId },
        include: { role: true },
      });
      return appUser
        ? {
            id: appUser.id,
            roleName: appUser.role.name,
            status: appUser.status,
          }
        : null;
    },
    async markLogin(userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  });

  return Response.json(result.body, { status: result.status });
}
