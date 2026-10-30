"use client";

import Link from "next/link";
import { useSidebarVisibility } from "@/components/study-ui-preferences";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { NavigationPendingIndicator } from "@/components/navigation-pending-indicator";
import { TitleActivityTracker } from "@/components/title-activity-tracker";
import { StudentAvatar as ProfileImage } from "@/components/student-avatar";
import type { StudentIdentity } from "@/lib/me";

type NavigationItem = {
  label: string;
  href: string;
  icon: IconName;
};

type IconName =
  | "home"
  | "shuffle"
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
  { label: "ランダム出題", href: "/random-quiz", icon: "shuffle" },
  { label: "過去問練習", href: "/practice", icon: "book" },
  { label: "復習ノート", href: "/review-notebook", icon: "book" },
  { label: "模擬試験", href: "/mock-exam", icon: "clipboard" },
  { label: "ランキング", href: "/ranking", icon: "crown" },
  { label: "称号ショップ", href: "/titles", icon: "medal" },
  { label: "掲示板", href: "/board", icon: "message" },
  { label: "マイページ", href: "/profile", icon: "user" },
];

type StudentShellProps = {
  children: ReactNode;
  identity?: StudentIdentity | null;
  userName?: string;
  avatarUrl?: string | null;
  points?: number;
  isLoading?: boolean;
};

export function StudentShell({
  children,
  identity,
  userName,
  avatarUrl,
  isLoading = false,
}: StudentShellProps) {
  const pathname = usePathname();
  const identityProvided = identity !== undefined;
  const [fetchedUserName, setFetchedUserName] = useState<string | null>(null);
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = useState<string | null>(null);
  const [userFetchComplete, setUserFetchComplete] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useSidebarVisibility("student");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const accountMenu = useRef<HTMLDivElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    function dismissOutside(event: PointerEvent) {
      if (!accountMenu.current?.contains(event.target as Node)) setUserMenuOpen(false);
    }
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setUserMenuOpen(false);
      accountTrigger.current?.focus();
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [userMenuOpen]);


  useEffect(() => {
    if (isLoading || identityProvided || (userName !== undefined && avatarUrl !== undefined)) {
      return;
    }

    let active = true;

    fetch("/api/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { displayName?: unknown; profile?: { avatarUrl?: unknown } | null }) => {
        if (!active) return;
        setFetchedUserName(
          typeof data.displayName === "string" && data.displayName.trim()
            ? data.displayName
            : null,
        );
        setFetchedAvatarUrl(typeof data.profile?.avatarUrl === "string" ? data.profile.avatarUrl : null);
      })
      .catch(() => {
        if (active) setFetchedUserName(null);
      })
      .finally(() => {
        if (active) setUserFetchComplete(true);
      });

    return () => {
      active = false;
    };
  }, [userName, avatarUrl, isLoading, identityProvided]);

  const resolvedUserName = identityProvided ? identity?.displayName ?? null : userName ?? fetchedUserName;
  const resolvedAvatarUrl = identityProvided ? identity?.avatarUrl ?? null : avatarUrl !== undefined ? avatarUrl : fetchedAvatarUrl;
  const userLoading = identityProvided ? identity === null : userName === undefined && !userFetchComplete;

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
      {isLoading ? null : <TitleActivityTracker />}
      <div className="app-frame">
        <aside
          className={`app-sidebar ${mobileSidebarOpen ? "app-sidebar--open" : ""} ${desktopSidebarVisible ? "" : "app-sidebar--collapsed"}`}
        >
          <div className="app-sidebar-inner">
            <Link href="/" className="app-brand">
              <span className="app-brand-mark">
                <TrophyMark />
              </span>
              <span>
                <span className="app-brand-slogan">目指せ合格!</span>
                <span className="app-brand-name">過去問くん</span>
              </span>
            </Link>

            <nav aria-label="メインナビゲーション" className="app-nav">
              {navigation.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={`app-nav-link ${active ? "app-nav-link--active" : ""}`}
                  >
                    <AppIcon name={item.icon} className="size-5" />
                    {item.label}
                    <NavigationPendingIndicator label={item.label} />
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
                <AppIcon name="menu" className="size-5" />
              </button>

              <Link href="/" className="app-mobile-brand">過去問くん</Link>
              <div className="app-user-tools">
                <NotificationBell enabled={!isLoading} />

                <div ref={accountMenu} className="relative">
                  <button
                    type="button"
                    ref={accountTrigger}
                    aria-label="ユーザーメニュー"
                    aria-expanded={userMenuOpen}
                    onClick={() => {
                      setUserMenuOpen((current) => !current);
                    }}
                    className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-100"
                  >
                    <ProfileImage avatarUrl={resolvedAvatarUrl} displayName={resolvedUserName ?? "学生"} size={36} className="text-xl" fallback={<StudentAvatar />} />
                    {userLoading || !resolvedUserName ? (
                      <span
                        aria-label="ユーザー情報を読み込み中"
                        className="hidden h-4 w-20 rounded-full bg-slate-200 sm:inline-block"
                      />
                    ) : (
                      <span className="app-user-name">
                        {resolvedUserName}
                      </span>
                    )}
                    <AppIcon name="chevron" className="size-4 text-slate-600" />
                  </button>

                  {userMenuOpen ? (
                    <div className="app-account-menu">
                      <p className="app-menu-identity">{resolvedUserName ?? "学生"}</p>
                      <Link
                        href="/profile"
                        onClick={() => setUserMenuOpen(false)}
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

          <main id="main-content" className="app-main">{children}</main>
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
    case "shuffle":
      return (
        <svg {...common}>
          <path d="M4 7h2.5c4.5 0 6.5 10 11 10H20M17 14l3 3-3 3M4 17h2.5c1.5 0 2.7-1.1 3.8-2.6M13.7 9.6C14.8 8.1 16 7 17.5 7H20M17 4l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
      <path d="M10 36c2-6 6-9 11-9s9 3 11 9" fill="var(--accent)" />
      <path d="M18 30h6l-3 4-3-4Z" fill="#fff" />
    </svg>
  );
}
