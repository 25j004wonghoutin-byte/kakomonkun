import { GoogleLoginButton } from "@/components/google-login-button";

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
    <main className="grid min-h-screen place-items-center bg-[var(--page-bg)] px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_24px_80px_-32px_rgba(37,99,235,0.55)]">
        <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-8 py-9 text-white">
          <div className="grid size-14 place-items-center rounded-2xl bg-white/20 text-2xl font-black backdrop-blur">
            過
          </div>
          <p className="mt-6 text-xs font-black tracking-[0.18em] text-blue-100">
            目指せ合格！
          </p>
          <h1 className="mt-1 text-3xl font-black">過去問くん</h1>
          <p className="mt-3 text-sm leading-6 text-blue-50">
            Googleアカウントでログインして、学習を続けましょう。
          </p>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-black text-slate-950">学生ログイン</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            初回ログイン時に学生プロフィールが自動で作成されます。
          </p>

          {params.error ? (
            <p
              role="alert"
              className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700"
            >
              ログイン処理を完了できませんでした。もう一度お試しください。
            </p>
          ) : null}

          <div className="mt-6">
            <GoogleLoginButton nextPath={nextPath} />
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-slate-400">
            現在、学生はGoogleログインのみ利用できます。
          </p>
        </div>
      </section>
    </main>
  );
}
