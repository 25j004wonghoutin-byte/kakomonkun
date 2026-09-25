"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TestStudentLoginFormProps = {
  nextPath: string;
};

export function TestStudentLoginForm({ nextPath }: TestStudentLoginFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function signInAsTestStudent() {
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/dev/test-student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: "test-student" }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(readError(payload));
      }

      const meResponse = await fetch("/api/me", { cache: "no-store" });
      const mePayload: unknown = await meResponse.json().catch(() => null);
      if (!meResponse.ok || !isStudentSession(mePayload)) {
        throw new Error("学生テストアカウントでログインできませんでした。");
      }

      router.replace(nextPath);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "テストログインに失敗しました。");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-5 border-t border-slate-200 pt-5">
      <button
        type="button"
        onClick={signInAsTestStudent}
        disabled={submitting}
        className="h-12 w-full rounded-lg border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? "ログイン中..." : "test-studentでログイン"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-rose-600">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-xs font-medium text-slate-400">
        開発環境専用の学生テストアカウントです。
      </p>
    </div>
  );
}

function isStudentSession(value: unknown) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).role === "student"
  );
}

function readError(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = (value as Record<string, unknown>).error;
    if (typeof message === "string") return message;
  }

  return "テストログインに失敗しました。";
}
