import Link from "next/link";
import { GoogleLoginButton } from "@/components/google-login-button";
import { LoginLayout } from "@/components/login-layout";
import { TestStudentLoginForm } from "@/components/test-student-login-form";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
};

function getSafeNextPath(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeNextPath(params.next);

  return (
    <LoginLayout audience="student">
      <div className="w-full max-w-[430px]">
        <h1 className="text-3xl font-black tracking-[0.01em] text-[#071d36] sm:text-4xl">
          学生ログイン
        </h1>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-500 sm:text-base">
          Googleアカウントでログインしてください。
        </p>

        <div className="mt-8">
          {params.error ? (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700"
            >
              ログイン処理を完了できませんでした。もう一度お試しください。
            </p>
          ) : null}

          <GoogleLoginButton nextPath={nextPath} />

          {process.env.NODE_ENV !== "production" ? (
            <TestStudentLoginForm nextPath={nextPath} />
          ) : null}

          <Link
            href="/login/teacher"
            className="mt-8 block text-left text-sm font-bold text-blue-600 transition hover:text-blue-700 hover:underline"
          >
            教師ログインへ →
          </Link>

          <p className="mt-5 text-left text-xs font-medium leading-5 text-slate-400">
            ※ 初回ログイン時に学生プロフィールが自動で作成されます
          </p>
        </div>
      </div>
    </LoginLayout>
  );
}
