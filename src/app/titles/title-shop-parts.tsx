"use client";

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { TitleShopItem } from "@/lib/titles/contract";
import { paginateTitleShop, selectTitleShopItems, titleShopAction, type TitleShopFilter, type TitleShopSort } from "@/lib/titles/shop";

export function TitleShopList({ titles, totalPoints, onSelect }: {
  titles: TitleShopItem[]; totalPoints: number; onSelect: (title: TitleShopItem, button: HTMLButtonElement) => void;
}) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [filter, setFilter] = useState<TitleShopFilter>("all");
  const [sort, setSort] = useState<TitleShopSort>("default");
  const selectedTitles = selectTitleShopItems(titles, totalPoints, filter, sort);
  const { items, page, pageCount } = paginateTitleShop(selectedTitles, requestedPage);
  const panelRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const panelId = `${id}-titles`;
  const tabId = (number: number) => `${id}-page-${number}`;

  function changePage(nextPage: number) {
    if (nextPage === page) return;
    setRequestedPage(nextPage);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start", behavior: "instant" }));
  }
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    let nextPage;
    if (event.key === "ArrowRight") nextPage = page % pageCount + 1;
    else if (event.key === "ArrowLeft") nextPage = (page + pageCount - 2) % pageCount + 1;
    else if (event.key === "Home") nextPage = 1;
    else if (event.key === "End") nextPage = pageCount;
    else return;
    event.preventDefault();
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("button")[nextPage - 1]?.focus({ preventScroll: true });
    changePage(nextPage);
  }

  return <div className="flex flex-col">
    <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <div>
        <label htmlFor={`${id}-sort`} className="mb-1.5 block text-xs font-black text-slate-700">並び順</label>
        <select id={`${id}-sort`} name="sort" value={sort} onChange={(event) => { setSort(event.target.value as TitleShopSort); setRequestedPage(1); }} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <option value="default">標準</option>
          <option value="price-asc">ポイントが低い順</option>
          <option value="price-desc">ポイントが高い順</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-filter`} className="mb-1.5 block text-xs font-black text-slate-700">フィルター</label>
        <select id={`${id}-filter`} name="filter" value={filter} onChange={(event) => { setFilter(event.target.value as TitleShopFilter); setRequestedPage(1); }} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <option value="all">すべて</option>
          <option value="available">購入可能</option>
          <option value="owned">購入済</option>
          <option value="locked">条件未達成</option>
          <option value="insufficient">ポイント不足</option>
        </select>
      </div>
      <p role="status" aria-atomic="true" className="text-xs font-bold text-slate-500 sm:pb-3">{selectedTitles.length}件 / 全{titles.length}件</p>
    </div>
    {pageCount > 1 ? <div ref={tabsRef} role="tablist" aria-label="称号のページ" className="order-last mt-5 flex flex-wrap justify-center gap-1 border-t border-slate-200 pt-3">
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button
        key={number} id={tabId(number)} type="button" role="tab" aria-label={`${number}ページ目`} aria-selected={number === page} aria-controls={panelId} tabIndex={number === page ? 0 : -1}
        onClick={() => changePage(number)} onKeyDown={handleTabKey}
        className={`min-h-11 min-w-11 border-b-2 px-3 text-sm font-black transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${number === page ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}
      >{number}</button>)}
    </div> : null}
    <section ref={panelRef} id={panelId} role={pageCount > 1 ? "tabpanel" : undefined} tabIndex={pageCount > 1 ? 0 : undefined} aria-labelledby={pageCount > 1 ? tabId(page) : undefined} aria-label="販売中の称号" className="grid scroll-mt-24 gap-3 md:grid-cols-2">
      {items.map((title) => <TitleShopCard key={title.id} title={title} totalPoints={totalPoints} onSelect={onSelect} />)}
      {items.length === 0 ? <p className="col-span-full rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm font-bold text-slate-500">該当する称号はありません。</p> : null}
    </section>
  </div>;
}

export function TitleShopCard({ title, totalPoints, onSelect }: { title: TitleShopItem; totalPoints: number; onSelect: (title: TitleShopItem, button: HTMLButtonElement) => void }) {
  const action = titleShopAction(title, totalPoints);
  const label = title.owned ? "所持済み" : title.state === "starter" ? "初期称号" : action === "condition" ? "購入条件未達成" : action === "none" ? "ポイント不足" : "購入する";
  return (
    <article tabIndex={-1} className="overflow-hidden rounded-xl border border-slate-200 bg-white ">
      <button type="button" disabled={action === "none"} onClick={(event) => onSelect(title, event.currentTarget)} className="flex min-h-32 w-full flex-col text-left transition enabled:hover:border-blue-400 enabled:hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-default">
        <span className="flex w-full flex-1 items-start justify-between gap-4 px-5 py-4">
          <span role="heading" aria-level={3} className="font-black leading-6 text-slate-950">{title.name}</span>
          {title.owned ? <span className="shrink-0 text-xs font-black text-blue-600">所持済み</span> : null}
        </span>
        <span className="flex w-full items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
          {action === "condition" ? <span className="text-xs font-bold text-slate-500">{title.implemented ? "条件達成で無料" : "ランキング実装待ち"}</span> : <span className="flex items-baseline gap-1 text-slate-950"><strong className="text-xl font-black">{title.pricePoints}</strong><span className="text-xs font-bold text-slate-500">pt</span></span>}
          <span className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-xs font-black ${action === "purchase" ? "bg-blue-600 text-white" : action === "condition" ? "border border-blue-200 bg-blue-50 text-blue-700" : label === "ポイント不足" ? "border border-slate-300 bg-white text-rose-600" : "border border-slate-300 bg-white text-slate-500"}`}>{label}</span>
        </span>
      </button>
    </article>
  );
}

export function TitleShopDialog({ title, kind, totalPoints, submitting, error, onClose, onPurchase, confirmRef, dialogRef }: {
  title: TitleShopItem; kind: "condition" | "purchase"; totalPoints: number; submitting: boolean; error: string;
  onClose: () => void; onPurchase: () => void;
  confirmRef?: RefObject<HTMLButtonElement | null>; dialogRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="title-dialog-title" aria-describedby="title-dialog-description" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl bg-white ">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 id="title-dialog-title" className="font-black text-slate-950">{kind === "condition" ? "称号の購入条件" : "称号の購入確認"}</h2>
          <button type="button" aria-label="閉じる" onClick={onClose} disabled={submitting} className="grid size-9 place-items-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50">×</button>
        </header>
        <div className="px-5 py-5">
          <p id="title-dialog-description" className="text-sm leading-6 text-slate-700">「<strong className="font-black text-slate-950">{title.name}</strong>」{kind === "condition" ? "の購入条件" : "を購入します。"}</p>
          {kind === "condition" ? <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-7 text-slate-700"><p>{title.conditionText ?? "この称号は現在購入できません。"}</p><p className="mt-3 text-xs font-bold text-blue-700">条件を達成すると、以後いつでも無料で購入できます。</p></div> : <>
            <dl className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-4"><dt className="text-slate-600">現在のポイント</dt><dd className="font-black text-slate-950">{totalPoints} pt</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-slate-600">使用するポイント</dt><dd className="font-black text-slate-950">{title.pricePoints} pt</dd></div>
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3"><dt className="font-bold text-slate-700">購入後のポイント</dt><dd className="font-black text-slate-950">{totalPoints - title.pricePoints} pt</dd></div>
            </dl>
            <p className="mt-4 text-xs font-bold leading-5 text-slate-500">購入した称号は自動で装備されません。マイページで装備を変更できます。</p>
          </>}
          {error ? <p className="mt-4 text-sm font-black text-rose-700" role="alert">{error}</p> : null}
        </div>
        <footer className={`grid gap-2 border-t border-slate-200 px-5 py-4 ${kind === "purchase" ? "sm:grid-cols-2" : ""}`}>
          <button ref={kind === "condition" ? confirmRef : undefined} type="button" onClick={onClose} disabled={submitting} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">{kind === "condition" ? "閉じる" : "キャンセル"}</button>
          {kind === "purchase" ? <button ref={confirmRef} type="button" onClick={onPurchase} disabled={submitting} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-400">{submitting ? "購入しています..." : "購入する"}</button> : null}
        </footer>
      </section>
    </div>
  );
}
