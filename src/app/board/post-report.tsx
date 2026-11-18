"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { BOARD_REPORT_REASONS } from "@/lib/board/moderation-contract";
import { readJsonResponse } from "@/lib/read-json-response";

export function PostReport({ postId }: { postId: string }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const reason = new FormData(event.currentTarget).get("reason");
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${postId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const data = await readJsonResponse<{ error?: string }>(response);
        setError(data?.error ?? "通報を送信できませんでした。");
        return;
      }
      setAccepted(true);
      dialog.current?.close();
    } catch {
      setError("通報を送信できませんでした。もう一度お試しください。");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-disabled={accepted}
        className="min-h-10 font-bold hover:text-rose-700 aria-disabled:cursor-default"
        onClick={() => {
          if (accepted) return;
          setError("");
          dialog.current?.showModal();
        }}
      >
        {accepted ? "通報済み" : "通報"}
      </button>
      <span className="sr-only" role="status">{accepted ? "通報を受け付けました。" : ""}</span>
      <dialog
        ref={dialog}
        aria-labelledby={id + "-heading"}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-5 text-slate-950 backdrop:bg-slate-950/40 sm:p-6"
        onClose={() => trigger.current?.focus()}
        onCancel={(event) => { if (pending) event.preventDefault(); }}
      >
        <form onSubmit={submit} className="grid gap-4 text-sm">
          <div>
            <h2 id={id + "-heading"} className="text-lg font-black">投稿を通報する</h2>
            <p className="mt-1 leading-6 text-slate-600">教員には、通報者の名前やアカウント情報は表示されません。</p>
          </div>
          <label htmlFor={id + "-reason"} className="grid gap-2 font-bold">
            通報理由
            <select id={id + "-reason"} name="reason" required defaultValue="" disabled={pending} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
              <option value="" disabled>理由を選ぶ</option>
              {BOARD_REPORT_REASONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {error ? <p role="alert" className="text-rose-700">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={pending} onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg px-4 hover:bg-slate-100">キャンセル</button>
            <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-blue-700 px-4 text-white hover:bg-blue-800 disabled:opacity-50">{pending ? "送信中…" : "通報する"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
