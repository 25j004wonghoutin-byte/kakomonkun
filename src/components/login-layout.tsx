import Image from "next/image";
import type { ReactNode } from "react";

type LoginAudience = "student" | "teacher";

type LoginLayoutProps = {
  audience: LoginAudience;
  children: ReactNode;
};

const audienceCopy: Record<
  LoginAudience,
  { title: ReactNode }
> = {
  teacher: {
    title: (
      <>
        学びを支える
        <br />
        教師用ポータル
      </>
    ),
  },
  student: {
    title: (
      <>
        今日の一問から、
        <br />
        合格へ一歩ずつ。
      </>
    ),
  },
};

export function LoginLayout({ audience, children }: LoginLayoutProps) {
  const copy = audienceCopy[audience];

  return (
    <main className="login-page">
      <section className="login-shell lg:grid-cols-[3fr_7fr]">
        <aside className="login-intro">
          <Image src="/brand-login.svg" alt="目指せ合格！過去問くん" width={380} height={108} loading="eager" />
          <h2>{copy.title}</h2>
          <p>ITパスポート・基本情報技術者試験</p>
        </aside>
        <div className="login-form-region">
          <div className="w-full max-w-[430px]">{children}</div>
        </div>
      </section>
    </main>
  );
}
