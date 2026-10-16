"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { createAvatarEditorController } from "./avatar-editor-state";
import { drawAvatarCrop, encodeAvatarCrop, prepareAvatarSource } from "./avatar-image";

type Props = { open: boolean; currentAvatarUrl: string | null; onClose(): void; onSaved(avatarUrl: string | null): void };

export function AvatarEditor(props: Props) {
  return props.open ? <OpenAvatarEditor {...props} /> : null;
}

function OpenAvatarEditor({ currentAvatarUrl, onSaved, onClose }: Props) {
  const [controller] = useState(() => createAvatarEditorController({ currentAvatarUrl, onSaved, onClose, prepareSource: prepareAvatarSource, encodeCrop: encodeAvatarCrop }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{x: number; y: number} | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    let active = true;
    queueMicrotask(() => { if (active && !dialog.open) dialog.showModal(); });
    return () => {
      active = false; if (dialog.open) dialog.close();
      queueMicrotask(() => { if (!dialog.isConnected) controller.dispose(); });
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [controller]);
  useEffect(() => {
    if (canvasRef.current && state.source) drawAvatarCrop(canvasRef.current, state.source, state.crop);
  }, [state.source, state.crop]);
  function pan(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current || state.busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const crop = controller.getSnapshot().crop;
    controller.move({ ...crop, x: crop.x + (event.clientX - drag.current.x) / rect.width, y: crop.y + (event.clientY - drag.current.y) / rect.height });
    drag.current = { x: event.clientX, y: event.clientY };
  }
  function keyPan(event: KeyboardEvent<HTMLCanvasElement>) {
    const step = event.shiftKey ? 0.05 : 0.01;
    const direction: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (direction[event.key]) { event.preventDefault(); const [x,y] = direction[event.key]; controller.move({ ...state.crop, x: state.crop.x + x, y: state.crop.y + y }); }
  }
  const button = "rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <dialog ref={dialogRef} aria-labelledby="avatar-editor-heading" aria-describedby="avatar-editor-description"
      onCancel={event => { event.preventDefault(); controller.close(); }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="avatar-editor-heading" className="text-lg font-black">アイコンを変更</h2>
          <button type="button" aria-label="アイコン編集を閉じる" disabled={state.busy} onClick={controller.close} className="grid size-9 place-items-center rounded-lg text-xl hover:bg-slate-100 disabled:opacity-50">×</button>
        </header>
        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
          <p id="avatar-editor-description" className="text-sm leading-6 text-slate-500">画像を移動・拡大して、丸い枠に合わせてください。JPEG・PNG・WebP、5MBまで。</p>
          <label className="block text-sm font-bold">画像を選択
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={state.busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void controller.choose(file); }}
              className="mt-2 block w-full min-w-0 rounded-lg border border-slate-200 p-2 text-xs font-normal file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-bold file:text-blue-700" />
          </label>
          {state.loading ? <p role="status" className="text-center text-sm text-slate-500">画像を読み込んでいます…</p> : null}
          {state.source ? <div className="space-y-4">
            <canvas ref={canvasRef} width={512} height={512} tabIndex={0} role="img" aria-label="切り抜き位置を調整。ドラッグまたは矢印キーで移動できます。" onKeyDown={keyPan}
              onPointerDown={event => { if (!state.busy) { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY }; } }}
              onPointerMove={pan} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
              className="mx-auto aspect-square w-full max-w-[260px] touch-none cursor-move rounded-full border-4 border-blue-100 bg-slate-100 outline-offset-4 focus:outline-2 focus:outline-blue-600" />
            <label className="block text-sm font-bold" htmlFor="avatar-zoom">拡大率 <span className="font-normal text-slate-500">{state.crop.zoom.toFixed(2)}倍</span></label>
            <input id="avatar-zoom" type="range" min={1} max={3} step={0.01} value={state.crop.zoom} disabled={state.busy} onChange={event => controller.move({ ...state.crop, zoom: Number(event.target.value) })} className="block w-full accent-blue-600" />
            <p className="text-xs leading-5 text-slate-500">矢印キーでも位置を調整できます。Shiftを押すと大きく移動します。</p>
          </div> : !state.loading ? <div className="grid h-28 place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">画像を選ぶとプレビューが表示されます</div> : null}
          {state.error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm leading-6 text-rose-700">{state.error}</p> : null}
          {state.needsRefresh ? <button type="button" disabled={state.busy} onClick={() => void controller.refresh()} className={button}>最新の状態を確認</button> : null}
          {state.confirmDelete ? <section aria-label="アイコンの削除確認" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-bold">現在のアイコンを削除して初期表示へ戻しますか？</p>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={state.busy} onClick={() => void controller.confirmDelete()} className={`${button} bg-white text-rose-700`}>削除する</button><button type="button" disabled={state.busy} onClick={controller.cancelDelete} className={button}>削除をやめる</button></div>
          </section> : state.expectedAvatarUrl !== null ? <button type="button" disabled={state.busy || state.needsRefresh || state.loading} onClick={controller.requestDelete} className="text-sm font-bold text-rose-600 disabled:opacity-50">現在のアイコンを削除</button> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
          {state.busy ? <span role="status" className="mr-auto text-sm text-slate-500">処理しています…</span> : null}
          <button type="button" disabled={state.busy} onClick={controller.close} className={button}>キャンセル</button>
          <button type="button" disabled={!state.source || state.busy || state.loading || state.needsRefresh || state.confirmDelete} onClick={() => void controller.save()} className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">保存する</button>
        </footer>
      </div>
    </dialog>
  );
}
