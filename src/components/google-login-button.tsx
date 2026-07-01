"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type GoogleLoginButtonProps = {
  nextPath: string;
};

export function GoogleLoginButton({ nextPath }: GoogleLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (signInError) {
      setError("Googleログインを開始できませんでした。もう一度お試しください。");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        className="flex h-20 w-full items-center justify-center gap-4 rounded-xl border border-slate-300 bg-white px-5 text-xl font-black text-[#071d36] shadow-[0_10px_22px_-16px_rgba(15,23,42,0.85)] transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 sm:gap-8 sm:px-6 sm:text-2xl"
      >
        <GoogleIcon />
        {loading ? "Googleへ移動しています..." : "Googleでログイン"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-9 shrink-0 sm:size-11">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.32-1.93V7.45H3.05A10 10 0 0 0 2 12c0 1.64.39 3.19 1.05 4.55l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.8.5 3.84 1.5l2.87-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.95 5.45l3.35 2.62c.79-2.37 3-4.13 5.6-4.13Z"
      />
    </svg>
  );
}
