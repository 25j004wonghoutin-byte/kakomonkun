"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { StudentShell } from "@/components/student-shell";

export type RoleNavigationItem = {
  label: string;
  href: string;
  icon: "home" | "students" | "message" | "bell" | "exam";
};

const teacherNavigation: RoleNavigationItem[] = [
  { label: "教師ホーム", href: "/teacher", icon: "home" },
  { label: "学習状況", href: "/teacher/students", icon: "students" },
  { label: "模擬試験状況", href: "/teacher/mock-exams", icon: "exam" },
  { label: "掲示板", href: "/board", icon: "message" },
  { label: "通知", href: "/notifications", icon: "bell" },
];

type RoleShellProps = {
  children: ReactNode;
  roleName: string;
  userName: string;
};

export function RoleShell({ children, roleName, userName }: RoleShellProps) {
  if (roleName === "teacher") {
    return (
      <RoleNavigationShell
        navigation={teacherNavigation}
        userName="管理者"
        avatarLabel="管"
      >
        {children}
      </RoleNavigationShell>
    );
  }

  return <StudentShell userName={userName}>{children}</StudentShell>;
}

type RoleNavigationShellProps = {
  children: ReactNode;
  navigation: RoleNavigationItem[];
  userName: string;
  avatarLabel: string;
};

export function RoleNavigationShell({
  children,
  navigation,
  userName,
  avatarLabel,
}: RoleNavigationShellProps) {
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
    <div className="app-shell" data-sidebar-collapsed={!desktopSidebarVisible}>
      <a href="#main-content" className="app-skip-link">本文へ移動</a>
      <div className="app-frame">
        <aside
          className={`app-sidebar ${mobileSidebarOpen ? "app-sidebar--open" : ""} ${desktopSidebarVisible ? "" : "app-sidebar--collapsed"}`}
        >
          <div className="app-sidebar-inner">
            <Link href="/teacher" className="app-brand">
              <span className="app-brand-mark">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 3h12v18H6zM9 8h6M9 12h6m-6 4 2 2 4-4" /></svg>
              </span>
              <span>
                <span className="app-brand-slogan">目指せ合格!</span>
                <span className="app-brand-name">過去問くん</span>
              </span>
            </Link>

            <nav aria-label="メインナビゲーション" className="app-nav">
              {navigation.map((item) => {
                const active =
                  item.href === "/teacher"
                    ? pathname === "/teacher"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={`app-nav-link ${active ? "app-nav-link--active" : ""}`}
                  >
                    <RoleIcon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="app-nav-link"
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
            className="app-sidebar-backdrop"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}

        <div className="app-workspace">
          <header className="app-header">
            <div className="app-toolbar">
              <button
                type="button"
                aria-label="サイドバーを表示または非表示"
                onClick={toggleSidebar}
                className="app-menu-toggle"
              >
                <MenuIcon />
              </button>

              <Link href="/" className="app-mobile-brand">過去問くん</Link>
              <div className="app-user-tools">
                <NotificationBell />
                <div className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2">
                  <span className="grid size-9 place-items-center rounded-full bg-slate-100 text-sm font-medium text-slate-700">
                    {avatarLabel}
                  </span>
                  <span className="text-xs font-black text-blue-800">
                    {userName}
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main id="main-content" className="app-main">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function RoleIcon({ name }: { name: RoleNavigationItem["icon"] }) {
  if (name === "exam") {
    return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
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
