"use client";

import Link from "next/link";
import { useState } from "react";
import { LoginSurface, SchoolBadge } from "@/components/login-screen";

export default function TeacherLoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <LoginSurface>
      <div className="flex flex-1 flex-col px-6 pb-10 pt-24 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-[690px] flex-1 flex-col items-center justify-center">
          <SchoolBadge />
          <h1 className="mt-7 whitespace-nowrap text-center text-4xl font-black tracking-[0.04em] text-[#071d36] sm:text-5xl">
            教師アカウント
          </h1>

          <form
            className="mt-9 w-full space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <label className="grid items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
              <span className="whitespace-nowrap text-left text-xl font-black text-[#071d36] sm:text-right sm:text-2xl">
                アカウント：
              </span>
              <input
                type="email"
                name="teacherAccount"
                autoComplete="username"
                placeholder="例）teacher@example.com"
                className="h-16 min-w-0 rounded-lg border border-slate-300 bg-white px-5 text-xl font-medium text-[#071d36] shadow-inner shadow-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="grid items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
              <span className="whitespace-nowrap text-left text-xl font-black text-[#071d36] sm:text-right sm:text-2xl">
                パスワード：
              </span>
              <span className="relative block min-w-0">
                <input
                  type={showPassword ? "text" : "password"}
                  name="teacherPassword"
                  autoComplete="current-password"
                  placeholder="パスワードを入力してください"
                  className="h-16 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-5 pr-14 text-xl font-medium text-[#071d36] shadow-inner shadow-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "パスワードを非表示" : "パスワードを表示"}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              </span>
            </label>

            <div className="pt-4 sm:pl-[150px]">
              <button
                type="submit"
                className="h-16 w-full max-w-[300px] rounded-lg bg-blue-600 px-8 text-2xl font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
              >
                ログイン
              </button>
            </div>
          </form>
        </div>

        <div className="mt-10 flex justify-end">
          <Link
            href="/login"
            className="text-base font-black text-blue-600 transition hover:text-blue-700 hover:underline sm:text-lg"
          >
            学生アカウントログイン画面に戻る
          </Link>
        </div>
      </div>
    </LoginSurface>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d="m4 4 16 16M10.7 10.7A2 2 0 0 0 13.3 13.3M8.5 5.8A10.5 10.5 0 0 1 12 5c5 0 8.4 4.1 9.5 6.1.3.6.3 1.2 0 1.8a16 16 0 0 1-2.2 3M6.2 8.1a16 16 0 0 0-3.7 3c-.3.6-.3 1.2 0 1.8C3.6 14.9 7 19 12 19c1.3 0 2.5-.3 3.6-.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d="M2.5 12.9c-.3-.6-.3-1.2 0-1.8C3.6 9.1 7 5 12 5s8.4 4.1 9.5 6.1c.3.6.3 1.2 0 1.8C20.4 14.9 17 19 12 19s-8.4-4.1-9.5-6.1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
