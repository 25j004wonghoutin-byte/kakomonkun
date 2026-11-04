"use client";

import { useRef, useState } from "react";
import { BANNER_COLORS, DEFAULT_BANNER_COLOR, normalizeBannerColor } from "@/lib/profile-banner";
import { readJsonResponse } from "@/lib/read-json-response";

export function ProfileBanner({ color, onSaved }: { color?: string | null; onSaved?: (color: string) => void }) {
  const savedColor = normalizeBannerColor(color) ?? DEFAULT_BANNER_COLOR;
  const [draft, setDraft] = useState(savedColor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  async function save() {
    if (pending || !onSaved) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/profile/banner", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bannerColor: draft }) });
      const data = await readJsonResponse<{ bannerColor?: string; error?: string }>(response);
      const next = normalizeBannerColor(data?.bannerColor);
      if (!response.ok || !next) throw new Error(data?.error ?? "バナーの色を保存できませんでした。");
      onSaved(next); dialog.current?.close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "バナーの色を保存できませんでした。"); }
    finally { setPending(false); }
  }
  return <>
    <div data-profile-banner className="flex h-32 items-start justify-end p-3 sm:p-4" style={{ backgroundColor: savedColor }}>
      {onSaved ? <button type="button" onClick={() => { setDraft(savedColor); setError(""); dialog.current?.showModal(); }} className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">バナーの色を変更</button> : null}
    </div>
    {onSaved ? <dialog ref={dialog} aria-label="バナーの色を変更" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border-0 p-5 text-slate-900 backdrop:bg-slate-950/50">
      <h2 className="text-lg font-black">バナーの色を変更</h2>
      <div aria-hidden="true" className="mt-4 h-24 rounded-lg border border-slate-200" style={{ backgroundColor: draft }} />
      <div role="group" aria-label="おすすめの色" className="mt-4 grid grid-cols-3 gap-2">
        {BANNER_COLORS.map(option => <button key={option.value} type="button" aria-pressed={draft === option.value} disabled={pending} onClick={() => setDraft(option.value)} className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"><span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-slate-300" style={{ backgroundColor: option.value }} />{option.name}{draft === option.value ? <span className="sr-only">選択中</span> : null}</button>)}
      </div>
      <label className="mt-4 flex min-h-11 items-center justify-between gap-3 text-sm font-bold">好きな色を選ぶ<input type="color" value={draft} disabled={pending} onChange={event => setDraft(event.target.value)} className="h-11 w-16 cursor-pointer rounded border border-slate-300 bg-white p-1" /></label>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={pending} onClick={() => dialog.current?.close()} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-bold disabled:opacity-50">キャンセル</button>
        <button type="button" disabled={pending} onClick={save} className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{pending ? "保存中..." : "保存する"}</button>
      </div>
    </dialog> : null}
  </>;
}
