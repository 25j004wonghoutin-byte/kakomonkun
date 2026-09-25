import Image from "next/image";
import type { ReactNode } from "react";

type LoginAudience = "student" | "teacher";

type LoginLayoutProps = {
  audience: LoginAudience;
  children: ReactNode;
};

const audienceCopy: Record<
  LoginAudience,
  { label: string; title: ReactNode; description: ReactNode }
> = {
  teacher: {
    label: "TEACHER PORTAL",
    title: (
      <>
        学びを支える
        <br />
        教師用ポータル
      </>
    ),
    description: (
      <>
        学生の学習状況を確認し、
        <br />
        掲示板からサポートできます。
      </>
    ),
  },
  student: {
    label: "STUDENT LOGIN",
    title: (
      <>
        今日の一問から、
        <br />
        合格へ一歩ずつ。
      </>
    ),
    description: (
      <>
        学習を積み重ねて、
        <br />
        試験合格を目指しましょう。
      </>
    ),
  },
};

export function LoginLayout({ audience, children }: LoginLayoutProps) {
  const copy = audienceCopy[audience];

  return (
    <main className="min-h-screen bg-[#f3f6fb] px-4 py-5 text-[#071d36] sm:px-6 sm:py-8 lg:grid lg:place-items-center lg:px-8">
      <section className="mx-auto grid min-h-[680px] w-full max-w-[1180px] overflow-hidden rounded-[22px] border border-[#d7e1ee] bg-white shadow-[0_24px_70px_-38px_rgba(7,29,54,0.65)] lg:grid-cols-[3fr_7fr]">
        <aside className="relative overflow-hidden bg-[#0b416d] px-6 py-7 text-white sm:px-8 lg:flex lg:min-h-[680px] lg:flex-col lg:px-8 lg:py-8">
          <div className="relative z-10">
            <Image
              src="/brand-login.svg"
              alt="目指せ合格！過去問くん"
              width={380}
              height={108}
              loading="eager"
              className="h-auto w-full max-w-[250px]"
            />
          </div>

          <div className="relative z-10 mt-8 lg:my-auto">
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#9bd5ff]">
              {copy.label}
            </p>
            <h2 className="mt-3 text-2xl font-black leading-[1.45] tracking-[0.01em] sm:text-[28px]">
              {copy.title}
            </h2>
            <p className="mt-4 text-sm font-medium leading-7 text-[#e0f2fe]">
              {copy.description}
            </p>
          </div>

          <p className="relative z-10 mt-7 text-[10px] font-medium text-[#b9d8ee] lg:mt-0">
            ITパスポート・基本情報技術者試験 対策アプリ
          </p>

          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-24 size-72 rounded-full border border-[#8ec7ed]/35" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-36 size-[430px] rounded-full bg-[#2a6691]/35" />
        </aside>

        <div className="flex min-h-[520px] items-center bg-white px-6 py-12 sm:px-12 lg:px-16 lg:py-16">
          <div className="mx-auto w-full max-w-[650px]">{children}</div>
        </div>
      </section>
    </main>
  );
}
