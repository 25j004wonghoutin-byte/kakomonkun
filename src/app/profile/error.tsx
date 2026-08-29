"use client";

import { useEffect } from "react";
import { StudentShell } from "@/components/student-shell";

export default function ProfileError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StudentShell>
      <div className="mx-auto grid min-h-[60vh] w-full max-w-[760px] place-items-center px-4 text-center">
        <div>
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-rose-200 bg-rose-50 text-xl font-black text-rose-700" aria-hidden="true">
            !
          </span>
          <h1 className="mt-4 text-xl font-black text-slate-950">学習データを読み込めませんでした</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            通信状況を確認して、もう一度お試しください。プロフィール情報は変更されていません。
          </p>
          <button
            type="button"
            onClick={unstable_retry}
            className="mt-6 min-h-11 rounded-md bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700"
          >
            再読み込み
          </button>
        </div>
      </div>
    </StudentShell>
  );
}
