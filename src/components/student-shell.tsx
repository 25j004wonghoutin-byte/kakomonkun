"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { label: "ホーム", href: "/" },
  { label: "過去問練習", href: "/practice" },
  { label: "模擬試験", href: "/mock-exam", disabled: true },
  { label: "ランキング", href: "/ranking", disabled: true },
  { label: "称号ショップ", href: "/titles", disabled: true },
  { label: "プロフィール", href: "/profile", disabled: true },
  { label: "掲示板", href: "/board", disabled: true },
];

type StudentShellProps = {
  children: ReactNode;
  userName?: string;
  points?: number;
};

export function StudentShell({
  children,
  userName = "デモ学生",
  points = 0,
}: StudentShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-xl font-black text-white shadow-lg shadow-blue-200 transition group-hover:-translate-y-0.5">
              過
            </span>
            <span>
              <span className="block text-xs font-bold tracking-[0.18em] text-blue-600">
                目指せ合格！
              </span>
              <span className="block text-lg font-black text-slate-900">過去問くん</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              aria-label="通知"
              className="relative grid size-10 place-items-center rounded-full border border-slate-200 text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              <BellIcon />
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-900">{userName}</p>
              <p className="text-xs font-semibold text-amber-600">{points} pt</p>
            </div>
            <div className="grid size-10 place-items-center rounded-full bg-slate-900 text-sm font-black text-white">
              {userName.slice(0, 1)}
            </div>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (item.disabled) {
              return (
                <span
                  key={item.label}
                  title="順次実装予定"
                  className="shrink-0 cursor-not-allowed rounded-full px-3 py-2 text-sm font-bold text-slate-400"
                >
                  {item.label}
                </span>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`shrink-0 rounded-full px-3 py-2 text-sm font-bold transition ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8.5C3 17.33 3.67 18 4.5 18h15c.83 0 1.5-.67 1.5-1.5C21 15 18 15 18 8ZM9.75 21h4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
