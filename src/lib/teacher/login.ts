import {
  normalizeTeacherAccountName,
  teacherAuthEmailForAccount,
} from "@/lib/teacher/identity";

type TeacherLoginInput = {
  account?: unknown;
  password?: unknown;
};

type AppUserIdentity = {
  id: string;
  roleName: string;
  status: string;
};

type TeacherLoginDependencies = {
  configuredAccount: string | null;
  signIn: (credentials: {
    email: string;
    password: string;
  }) => Promise<{ userId: string | null }>;
  findAppUser: (authUserId: string) => Promise<AppUserIdentity | null>;
  markLogin: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

type TeacherLoginResult = {
  status: number;
  body: { error: string } | { next: "/teacher" };
};

export async function authenticateTeacherLogin(
  input: TeacherLoginInput,
  dependencies: TeacherLoginDependencies,
): Promise<TeacherLoginResult> {
  if (!dependencies.configuredAccount) {
    return {
      status: 503,
      body: { error: "教師アカウントが設定されていません。" },
    };
  }

  if (typeof input.account !== "string" || typeof input.password !== "string") {
    return invalidCredentials();
  }

  const account = normalizeTeacherAccountName(input.account);
  const email = account ? teacherAuthEmailForAccount(account) : null;
  if (
    !account ||
    account !== dependencies.configuredAccount ||
    !email ||
    !input.password
  ) {
    return invalidCredentials();
  }

  let authUserId: string | null;
  try {
    ({ userId: authUserId } = await dependencies.signIn({
      email,
      password: input.password,
    }));
  } catch {
    return {
      status: 500,
      body: { error: "教師ログイン処理を完了できませんでした。" },
    };
  }

  if (!authUserId) return invalidCredentials();

  try {
    const appUser = await dependencies.findAppUser(authUserId);
    if (
      !appUser ||
      appUser.roleName !== "teacher" ||
      appUser.status !== "active"
    ) {
      await dependencies.signOut();
      return {
        status: 403,
        body: { error: "教師アカウントではありません。" },
      };
    }

    await dependencies.markLogin(appUser.id);
    return { status: 200, body: { next: "/teacher" } };
  } catch {
    await dependencies.signOut();
    return {
      status: 500,
      body: { error: "教師ログイン処理を完了できませんでした。" },
    };
  }
}

function invalidCredentials(): TeacherLoginResult {
  return {
    status: 401,
    body: { error: "アカウント名またはパスワードが正しくありません。" },
  };
}
