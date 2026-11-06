"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BANNER_COLORS, DEFAULT_BANNER_COLOR, normalizeBannerColor } from "@/lib/profile-banner";
import { readJsonResponse } from "@/lib/read-json-response";

export function ProfileBanner({ color, onSaved }: { color?: string | null; onSaved?: (color: string) => void }) {
  const savedColor = normalizeBannerColor(color) ?? DEFAULT_BANNER_COLOR;
  const [draft, setDraft] = useState(savedColor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRoot = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuItem = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    menuItem.current?.focus();
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menuRoot.current?.contains(event.target)) setMenuOpen(false);
    }
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [menuOpen]);

  function openEditor() {
    setMenuOpen(false);
    setDraft(savedColor);
    setError("");
    dialog.current?.showModal();
  }

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
      {onSaved ? <div ref={menuRoot} className="relative" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
      }}>
        <button ref={menuButton} type="button" aria-label="プロフィールのメニュー" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} disabled={pending}
          onClick={() => setMenuOpen(current => !current)}
          onKeyDown={event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setMenuOpen(true); menuItem.current?.focus(); }
          }}
          className="grid size-11 place-items-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
        {menuOpen ? <div id={menuId} role="menu" aria-label="プロフィールのメニュー" className="absolute right-0 top-full z-20 mt-2 w-52 rounded-lg bg-white p-1 shadow-lg"
          onKeyDown={event => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); menuItem.current?.focus(); }
          }}>
          <button ref={menuItem} type="button" role="menuitem" onClick={openEditor} className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-offset-[-2px]">バナーの色を変更</button>
        </div> : null}
      </div> : null}
    </div>
    {onSaved ? <dialog ref={dialog} onClose={() => menuButton.current?.focus()} aria-label="バナーの色を変更" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border-0 p-5 text-slate-900 backdrop:bg-slate-950/50">
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
