"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NotificationBell } from "@/components/notification-bell";

export type RoleNavigationItem = {
  label: string;
  href: string;
  icon: "home" | "students" | "message" | "bell";
};

type RoleShellProps = {
  children: ReactNode;
  navigation: RoleNavigationItem[];
  userName: string;
  avatarLabel: string;
};

export function RoleShell({
  children,
  navigation,
  userName,
  avatarLabel,
}: RoleShellProps) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true);

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
            <Link href="/teacher" className="flex gap-3 px-6 pb-7 pt-8">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">
                🏆
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
                  item.href === "/teacher"
                    ? pathname === "/teacher"
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
                    <RoleIcon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex h-12 w-full items-center gap-4 rounded-lg px-5 text-left text-sm font-bold text-blue-50 transition hover:bg-white/10"
                >
                  <LogoutIcon />
                  ログアウト
                </button>
              </form>
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
                <MenuIcon />
              </button>

              <div className="flex items-center gap-4">
                <NotificationBell />
                <div className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2">
                  <span className="grid size-11 place-items-center rounded-full border-2 border-violet-200 bg-violet-50 text-base font-black text-violet-700">
                    {avatarLabel}
                  </span>
                  <span className="hidden text-sm font-black text-violet-800 sm:inline">
                    {userName}
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="w-full min-w-0 overflow-x-hidden px-4 py-7 sm:px-7 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function RoleIcon({ name }: { name: RoleNavigationItem["icon"] }) {
  if (name === "home") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M4 10.8 12 4l8 6.8V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.2Z" />
      </svg>
    );
  }

  if (name === "students") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 7h5M18.5 4.5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "message") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
        <path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8.5C3 17.33 3.67 18 4.5 18h15c.83 0 1.5-.67 1.5-1.5C21 15 18 15 18 8ZM9.75 21h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
