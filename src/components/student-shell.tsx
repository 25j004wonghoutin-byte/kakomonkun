"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type NavigationItem = {
  label: string;
  href: string;
  icon: IconName;
};

type IconName =
  | "home"
  | "book"
  | "clipboard"
  | "crown"
  | "medal"
  | "message"
  | "user"
  | "bell"
  | "menu"
  | "chevron"
  | "logout";

const navigation: NavigationItem[] = [
  { label: "ホーム", href: "/", icon: "home" },
  { label: "過去問練習", href: "/practice", icon: "book" },
  { label: "模擬試験", href: "/mock-exam", icon: "clipboard" },
  { label: "ランキング", href: "/ranking", icon: "crown" },
  { label: "称号ショップ", href: "/titles", icon: "medal" },
  { label: "掲示板", href: "/board", icon: "message" },
  { label: "マイページ", href: "/profile", icon: "user" },
];

const notifications = [
  "今日の一問一答が更新されました。",
  "過去問練習で連続正解を目指しましょう。",
  "新しい称号がショップに追加されました。",
];

type StudentShellProps = {
  children: ReactNode;
  userName?: string;
  points?: number;
};

export function StudentShell({
  children,
  userName = "学生",
}: StudentShellProps) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  function toggleSidebar() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setDesktopSidebarVisible((current) => !current);
      return;
    }

    setMobileSidebarOpen((current) => !current);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f7fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-[230px] shrink-0 bg-[#031f3d] text-white shadow-2xl transition-all duration-300 lg:static lg:translate-x-0 ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${
            desktopSidebarVisible
              ? "lg:w-[230px]"
              : "lg:w-0 lg:overflow-hidden lg:shadow-none"
          }`}
        >
          <div className="flex h-full flex-col">
            <Link href="/" className="flex gap-3 px-6 pb-7 pt-8">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">
                <TrophyMark />
              </span>
              <span>
                <span className="block text-lg font-black leading-5">目指せ合格!</span>
                <span className="mt-0.5 block text-lg font-black leading-5">過去問くん</span>
                <span className="mt-2 block text-[11px] font-semibold leading-5 text-blue-100">
                  ITパスポート・基本情報技術者試験
                  <br />
                  対策学習アプリ
                </span>
              </span>
            </Link>

            <nav className="space-y-2 px-4">
              {navigation.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex h-12 items-center gap-4 rounded-lg px-5 text-sm font-bold transition ${
                      active
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                        : "text-blue-50 hover:bg-white/10"
                    }`}
                  >
                    <AppIcon name={item.icon} className="size-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {mobileSidebarOpen ? (
          <button
            type="button"
            aria-label="サイドバーを閉じる"
            className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
            <div className="flex h-[72px] items-center justify-between px-5 sm:px-7 lg:px-8">
              <button
                type="button"
                aria-label="サイドバーを表示または非表示"
                onClick={toggleSidebar}
                className="grid size-10 place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100"
              >
                <AppIcon name="menu" className="size-5" />
              </button>

              <div className="flex items-center gap-4">
                <div className="relative">
                  <button
                    type="button"
                    aria-label="通知"
                    aria-expanded={noticeOpen}
                    onClick={() => {
                      setNoticeOpen((current) => !current);
                      setUserMenuOpen(false);
                    }}
                    className="relative grid size-10 place-items-center rounded-full text-slate-700 transition hover:bg-slate-100"
                  >
                    <AppIcon name="bell" className="size-5" />
                    <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-red-500 text-[10px] font-black text-white ring-2 ring-white">
                      3
                    </span>
                  </button>

                  {noticeOpen ? (
                    <div className="absolute right-0 mt-3 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-300/40">
                      <p className="px-2 pb-2 text-sm font-black">通知</p>
                      <div className="space-y-2">
                        {notifications.map((message) => (
                          <div key={message} className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                            {message}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    aria-label="ユーザーメニュー"
                    aria-expanded={userMenuOpen}
                    onClick={() => {
                      setUserMenuOpen((current) => !current);
                      setNoticeOpen(false);
                    }}
                    className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-100"
                  >
                    <span className="grid size-11 place-items-center rounded-full border-2 border-blue-100 bg-blue-50 text-xl">
                      <StudentAvatar />
                    </span>
                    <span className="hidden text-sm font-black sm:inline">{userName}</span>
                    <AppIcon name="chevron" className="size-4 text-slate-600" />
                  </button>

                  {userMenuOpen ? (
                    <div className="absolute right-0 mt-3 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-2xl shadow-slate-300/40">
                      <Link
                        href="/profile"
                        className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        <AppIcon name="user" className="size-4" />
                        マイページ
                      </Link>
                      <form action="/auth/signout" method="post">
                        <button
                          type="submit"
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50"
                        >
                          <AppIcon name="logout" className="size-4" />
                          ログアウト
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main className="w-full min-w-0 overflow-x-hidden px-4 py-7 sm:px-7 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

function AppIcon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const common = {
    className,
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.8 12 4l8 6.8V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.2Z" fill="currentColor" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M6 4h11a1 1 0 0 1 1 1v15H7.5A2.5 2.5 0 0 1 5 17.5V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="2" />
          <path d="M8 8h7M8 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...common}>
          <path d="M8 5h8M9 3h6v4H9V3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M7 5H5v16h14V5h-2M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "crown":
      return (
        <svg {...common}>
          <path d="m4 8 4 4 4-7 4 7 4-4-2 10H6L4 8Z" fill="currentColor" />
          <path d="M7 21h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "medal":
      return (
        <svg {...common}>
          <path d="M8 3h8l-2 5h-4L8 3Z" fill="currentColor" />
          <path d="M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" strokeWidth="2" />
          <path d="m12 12 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 14.3l2-.3 1-2Z" fill="currentColor" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path d="M4 5h16v11H8l-4 4V5Z" fill="currentColor" />
          <path d="M8 9h8M8 13h5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8.5C3 17.33 3.67 18 4.5 18h15c.83 0 1.5-.67 1.5-1.5C21 15 18 15 18 8ZM9.75 21h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="m8 10 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function TrophyMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 42 42" className="size-8">
      <path d="M12 6h18v7c0 6-4 11-9 11s-9-5-9-11V6Z" fill="#facc15" />
      <path d="M12 10H6c0 5 3 9 7 9M30 10h6c0 5-3 9-7 9" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 24h6v7h7v5H11v-5h7v-7Z" fill="#f97316" />
      <path d="m21 9 1.4 2.8 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4L21 9Z" fill="#fff7ed" />
    </svg>
  );
}

function StudentAvatar() {
  return (
    <svg aria-hidden="true" viewBox="0 0 42 42" className="size-9">
      <circle cx="21" cy="21" r="20" fill="#dbeafe" />
      <path d="M12 18c0-6 4-10 9-10s9 4 9 10v3H12v-3Z" fill="#1f2937" />
      <circle cx="21" cy="20" r="8" fill="#fed7aa" />
      <path d="M13 17c3-1 6-3 8-6 2 3 5 5 8 6-1-5-4-8-8-8s-7 3-8 8Z" fill="#111827" />
      <circle cx="18" cy="20" r="1" fill="#111827" />
      <circle cx="24" cy="20" r="1" fill="#111827" />
      <path d="M18 25c2 1.5 4 1.5 6 0" stroke="#7c2d12" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 36c2-6 6-9 11-9s9 3 11 9" fill="#2563eb" />
      <path d="M18 30h6l-3 4-3-4Z" fill="#fff" />
    </svg>
  );
}
