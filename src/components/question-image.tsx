"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";

type ImageView = "fit" | "large" | "larger";
const imageViews: { value: ImageView; label: string }[] = [
  { value: "fit", label: "全体表示" },
  { value: "large", label: "拡大" },
  { value: "larger", label: "さらに拡大" },
];

export function QuestionImage({ src, alt }: { src: string; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const imageScroll = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ImageView>("large");

  function openImage() {
    setView("large");
    setOpen(true);
    dialog.current?.showModal();
  }

  function changeView(next: ImageView) {
    setView(next);
    imageScroll.current?.scrollTo({ left: 0, top: 0, behavior: "instant" });
  }

  return (
    <div className="question-image">
      <div className="question-image-tools">
        <button ref={trigger} type="button" onClick={openImage}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M7 10h6m-3-3v6" />
          </svg>
          問題画像を拡大
        </button>
      </div>
      <Image src={src} alt={alt} width={1400} height={900} loading="lazy" sizes="(max-width: 1023px) 100vw, 800px" className="mx-auto h-auto w-full max-w-full object-contain" />
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="question-image-dialog"
        onClose={() => { setOpen(false); trigger.current?.focus(); }}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <div className="question-image-dialog-header">
          <h2 id={titleId}>問題画像</h2>
          <button type="button" onClick={() => dialog.current?.close()}>閉じる</button>
          <div className="question-image-view-controls" role="group" aria-label="問題画像の表示サイズ">
            {imageViews.map((item) => (
              <button key={item.value} type="button" aria-pressed={view === item.value} onClick={() => changeView(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div ref={imageScroll} className="question-image-scroll" tabIndex={0} aria-label="拡大した問題画像。上下左右にスクロールできます">
          {open ? (
            <div style={{ width: view === "fit" ? "100%" : view === "large" ? 960 : 1440 }}>
              <Image src={src} alt={alt} width={1400} height={900} loading="lazy" sizes={view === "fit" ? "100vw" : "1440px"} className="block h-auto w-full max-w-none object-contain" />
            </div>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
