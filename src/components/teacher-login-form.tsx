"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isTeacherSessionPayload } from "@/lib/teacher/identity";

type LoginResponse = {
  error?: string;
  next?: string;
};

export function TeacherLoginForm() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const normalizedAccount = account.trim();
    if (!normalizedAccount || !password) {
      setError("アカウントとパスワードを入力してください。");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await signInAsTeacher(normalizedAccount, password);

      const meResponse = await fetch("/api/me", { cache: "no-store" });
      const mePayload: unknown = await meResponse.json().catch(() => null);

      if (!meResponse.ok || !isTeacherSessionPayload(mePayload)) {
        const supabase = createClient();
        await supabase.auth.signOut();
        throw new Error("教師アカウントではありません。");
      }

      router.replace("/teacher");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "ログイン処理を完了できませんでした。",
      );
      setSubmitting(false);
    }
  }

  async function signInAsTeacher(normalizedAccount: string, loginPassword: string) {
    const response = await fetch("/api/auth/teacher-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: normalizedAccount,
        password: loginPassword,
      }),
    });
    const data = parseLoginResponse(await response.text());

    if (!response.ok) {
      throw new Error(
        data.error ?? `教師ログインに失敗しました。（HTTP ${response.status}）`,
      );
    }
  }

  return (
    <div className="w-full max-w-[430px]">
      <h1 className="text-3xl font-black tracking-[0.01em] text-[#071d36] sm:text-4xl">
        教師ログイン
      </h1>
      <p className="mt-3 text-sm font-medium leading-6 text-slate-500 sm:text-base">
        共通アカウントの情報を入力してください。
      </p>

      <form className="mt-8 space-y-5" onSubmit={submitLogin} noValidate>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#071d36]">アカウント</span>
          <input
            type="text"
            name="teacherAccount"
            autoComplete="username"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            placeholder="アカウント名を入力"
            disabled={submitting}
            className="h-14 w-full rounded-lg border border-[#c9d5e5] bg-white px-4 text-base font-medium text-[#071d36] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#071d36]">パスワード</span>
          <span className="relative block">
            <input
              type={showPassword ? "text" : "password"}
              name="teacherPassword"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="パスワードを入力"
              disabled={submitting}
              className="h-14 w-full rounded-lg border border-[#c9d5e5] bg-white px-4 pr-14 text-base font-medium text-[#071d36] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
            />
            <button
              type="button"
              aria-label={showPassword ? "パスワードを非表示" : "パスワードを表示"}
              onClick={() => setShowPassword((current) => !current)}
              disabled={submitting}
              className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              {showPassword ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </span>
        </label>

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="h-14 w-full rounded-lg bg-blue-600 px-6 text-base font-black text-white shadow-[0_12px_24px_-14px_rgba(37,99,235,0.8)] transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-65"
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>

        <Link href="/login" className="block text-left text-sm font-bold text-blue-600 transition hover:text-blue-700 hover:underline">
          学生ログインへ戻る →
        </Link>
      </form>
    </div>
  );
}

function parseLoginResponse(text: string): LoginResponse {
  if (!text) return {};

  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    const record = value as Record<string, unknown>;
    return {
      error: typeof record.error === "string" ? record.error : undefined,
      next: typeof record.next === "string" ? record.next : undefined,
    };
  } catch {
    return {};
  }
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="m4 4 16 16M10.7 10.7A2 2 0 0 0 13.3 13.3M8.5 5.8A10.5 10.5 0 0 1 12 5c5 0 8.4 4.1 9.5 6.1.3.6.3 1.2 0 1.8a16 16 0 0 1-2.2 3M6.2 8.1a16 16 0 0 0-3.7 3c-.3.6-.3 1.2 0 1.8C3.6 14.9 7 19 12 19c1.3 0 2.5-.3 3.6-.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M2.5 12.9c-.3-.6-.3-1.2 0-1.8C3.6 9.1 7 5 12 5s8.4 4.1 9.5 6.1c.3.6.3 1.2 0 1.8C20.4 14.9 17 19 12 19s-8.4-4.1-9.5-6.1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
