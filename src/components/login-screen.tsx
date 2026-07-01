import type { ReactNode } from "react";

type LoginSurfaceProps = {
  children: ReactNode;
};

export function LoginSurface({ children }: LoginSurfaceProps) {
  return (
    <main className="min-h-screen bg-[#f7fafc] px-4 py-10 text-[#071d36] sm:px-6">
      <section className="relative mx-auto flex min-h-[680px] w-full max-w-[1120px] flex-col rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.75)]">
        <div className="flex flex-1 flex-col">{children}</div>
      </section>
    </main>
  );
}

export function BrandTitle() {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold tracking-[0.16em] text-[#071d36]">目指せ合格！</p>
      <h1 className="mt-7 whitespace-nowrap text-5xl font-black tracking-[0.04em] text-[#071d36] sm:text-7xl sm:tracking-[0.08em]">
        過去問くん
      </h1>
      <p className="mt-6 text-xl font-medium tracking-[0.04em] text-[#14263a] sm:text-2xl">
        ITパスポート・基本情報技術者試験　対策アプリ
      </p>
    </div>
  );
}

export function SchoolBadge() {
  return (
    <div className="mx-auto grid size-36 place-items-center rounded-full border-2 border-blue-100 bg-blue-50">
      <svg aria-hidden="true" viewBox="0 0 96 96" className="size-24">
        <path
          d="M19 79V42l29-16 29 16v37"
          fill="#e0f2fe"
          stroke="#0ea5e9"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M33 79V51h30v28" fill="#ffffff" stroke="#0ea5e9" strokeWidth="3" />
        <path d="M48 26V13l14 5-14 5" fill="#ffffff" stroke="#0ea5e9" strokeWidth="3" />
        <path d="M48 26v16" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />
        <circle cx="48" cy="44" r="6" fill="#ffffff" stroke="#0ea5e9" strokeWidth="3" />
        <path d="M24 79V61h10v18M62 79V61h10v18" fill="#bfdbfe" stroke="#0ea5e9" strokeWidth="3" />
        <path d="M42 79V62h12v17" fill="#bfdbfe" stroke="#0ea5e9" strokeWidth="3" />
        <path d="M16 65c-6-8 8-16 12-5M80 65c6-8-8-16-12-5" fill="none" stroke="#84cc16" strokeWidth="3" />
        <path d="M19 64v15M77 64v15" stroke="#84cc16" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
