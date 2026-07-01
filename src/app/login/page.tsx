import Link from "next/link";
import { GoogleLoginButton } from "@/components/google-login-button";
import { BrandTitle, LoginSurface } from "@/components/login-screen";

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
    <LoginSurface>
      <div className="flex flex-1 flex-col px-6 pb-10 pt-24 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center">
          <BrandTitle />

          <div className="mt-20 w-full max-w-[470px]">
            <p className="mb-7 text-xl font-bold text-[#071d36]">
              学生アカウントのログインはこちら
            </p>

            {params.error ? (
              <p
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
              >
                ログイン処理を完了できませんでした。もう一度お試しください。
              </p>
            ) : null}

            <GoogleLoginButton nextPath={nextPath} />

            <p className="mt-12 text-base font-medium text-[#14263a]">
              ※ 初回ログイン時に学生プロフィールが自動で作成されます
            </p>
          </div>
        </div>

        <div className="mt-10 flex justify-end">
          <Link
            href="/login/teacher"
            className="text-base font-black text-blue-600 transition hover:text-blue-700 hover:underline sm:text-lg"
          >
            教師アカウントのログインはこちら&gt;&gt;&gt;
          </Link>
        </div>
      </div>
    </LoginSurface>
  );
}
