"use client";

import Image from "next/image";
import { useId, useRef } from "react";

export function QuestionImage({ src, alt }: { src: string; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  return (
    <div className="question-image">
      <div className="question-image-tools">
        <button ref={trigger} type="button" onClick={() => dialog.current?.showModal()}>
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
        onClose={() => trigger.current?.focus()}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <div className="question-image-dialog-header">
          <h2 id={titleId}>問題画像</h2>
          <button type="button" onClick={() => dialog.current?.close()}>閉じる</button>
        </div>
        <div className="question-image-scroll" tabIndex={0} aria-label="拡大した問題画像。横にスクロールできます">
          <Image src={src} alt={alt} width={1400} height={900} loading="lazy" sizes="1400px" className="h-auto w-full min-w-[960px] object-contain" />
        </div>
      </dialog>
    </div>
  );
}
