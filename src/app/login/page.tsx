import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { GOOGLE_DOMAIN_ERROR_CODE, NEW_GOOGLE_ACCOUNT_DOMAIN } from "@/lib/google-login-policy";
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
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(value) ? value : "/";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeNextPath(params.next);

  // Check app access before redirecting; a rejected OAuth session can still exist.
  if (!params.error && await getCurrentUser()) redirect("/");

  return (
    <LoginLayout audience="student">
      <div className="w-full max-w-[430px]">
        <h1 className="text-3xl font-black tracking-[0.01em] text-[#242823] sm:text-4xl">
          学生ログイン
        </h1>

        <div className="mt-8">
          {params.error ? (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700"
            >
              {params.error === GOOGLE_DOMAIN_ERROR_CODE
                ? `新規のGoogleログインは @${NEW_GOOGLE_ACCOUNT_DOMAIN} のアカウントをご利用ください。既存のアカウントは引き続きログインできます。`
                : "ログイン処理を完了できませんでした。もう一度お試しください。"}
            </p>
          ) : null}

          <GoogleLoginButton nextPath={nextPath} />
          <p className="mt-4 text-sm leading-6 text-slate-600">
            新規登録は @{NEW_GOOGLE_ACCOUNT_DOMAIN} のアカウントのみご利用いただけます。
            既存のアカウントは、これまでどおりログインできます。
          </p>

          {process.env.NODE_ENV !== "production" ? (
            <TestStudentLoginForm nextPath={nextPath} />
          ) : null}

          <Link
            href="/login/teacher"
            className="mt-8 block text-left text-sm font-bold text-blue-600 transition hover:text-blue-700 hover:underline"
          >
            教師ログインへ →
          </Link>

        </div>
      </div>
    </LoginLayout>
  );
}
