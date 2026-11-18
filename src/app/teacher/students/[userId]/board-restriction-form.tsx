"use client";

import { useState, type FormEvent } from "react";
import { useBoardRestriction } from "@/app/board/board-restriction-notice";
import { formatBoardDateTime, toJapanDateTimeInput } from "@/lib/board/moderation-contract";
import { readJsonResponse } from "@/lib/read-json-response";

export function BoardRestrictionForm({ userId, initialExpiry }: { userId: string; initialExpiry: string | null }) {
  const [expiry, setExpiry] = useState(initialExpiry);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const activeExpiry = useBoardRestriction(expiry);

  async function update(method: "PUT" | "DELETE", expiresAt?: string) {
    if (pending) return;
    setPending(true);
    setError("");
    setResult("");
    try {
      const response = await fetch(`/api/teacher/students/${userId}/board-restriction`, method === "PUT" ? {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt }),
      } : { method });
      const data = await readJsonResponse<{ expiresAt?: string | null; error?: string }>(response);
      if (!response.ok || !data || data.expiresAt === undefined) {
        setError(data?.error ?? "利用制限を更新できませんでした。");
        return;
      }
      setExpiry(data.expiresAt);
      setResult(data.expiresAt ? "利用制限を設定しました。" : "利用制限を解除しました。");
    } catch {
      setError("利用制限を更新できませんでした。もう一度お試しください。");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const expiresAt = new FormData(event.currentTarget).get("expiresAt");
    if (typeof expiresAt === "string") void update("PUT", expiresAt);
  }

  return (
    <section id="board-restriction" className="mt-4 scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="font-black text-slate-950">掲示板の利用制限</h2>
      <p className="mt-1 text-sm text-slate-600">
        {activeExpiry ? <>制限中 · <time dateTime={activeExpiry}>{formatBoardDateTime(activeExpiry)}</time>に解除（日本時間）</> : "制限なし"}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">制限中は投稿・返信・いいねができません。閲覧と通報は利用できます。</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-800">
          解除日時（日本時間）
          <input key={expiry ?? "none"} type="datetime-local" name="expiresAt" required defaultValue={expiry ? toJapanDateTimeInput(new Date(expiry)) : ""} disabled={pending} className="min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3" />
        </label>
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{activeExpiry ? "期限を更新" : "利用を制限"}</button>
        {activeExpiry ? <button type="button" disabled={pending} onClick={() => void update("DELETE")} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">今すぐ解除</button> : null}
      </form>
      {result ? <p role="status" className="mt-2 text-sm text-slate-700">{result}</p> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
