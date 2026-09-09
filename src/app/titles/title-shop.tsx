"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StudentShell } from "@/components/student-shell";
import { PageHeading } from "@/components/ui";
import { readJsonResponse } from "@/lib/read-json-response";

type ShopTitle = {
  id: string;
  name: string;
  pricePoints: number;
  owned: boolean;
};

export type TitleShopInitialData = {
  displayName: string;
  totalPoints: number;
  currentTitle: {
    id: string;
    name: string;
  } | null;
  titles: ShopTitle[];
};

type PurchaseResponse = {
  error?: string;
  title?: {
    id: string;
    name: string;
  };
  totalPoints?: number;
};

export function TitleShop({ initialData }: { initialData: TitleShopInitialData }) {
  const [titles, setTitles] = useState(initialData.titles);
  const [totalPoints, setTotalPoints] = useState(initialData.totalPoints);
  const [selectedTitle, setSelectedTitle] = useState<ShopTitle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selectedTitle) return;

    confirmButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setSelectedTitle(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedTitle, submitting]);

  function openPurchaseDialog(title: ShopTitle) {
    setMessage("");
    setError("");
    setSelectedTitle(title);
  }

  function closePurchaseDialog() {
    if (!submitting) setSelectedTitle(null);
  }

  async function purchaseTitle() {
    if (!selectedTitle) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/titles/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId: selectedTitle.id }),
      });
      const data = await readJsonResponse<PurchaseResponse>(response);

      if (!response.ok || typeof data?.totalPoints !== "number") {
        throw new Error(data?.error ?? "称号を購入できませんでした。");
      }

      setTotalPoints(data.totalPoints);
      setTitles((current) =>
        current.map((title) =>
          title.id === selectedTitle.id ? { ...title, owned: true } : title,
        ),
      );
      setMessage(`「${selectedTitle.name}」を購入しました。`);
      setSelectedTitle(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "称号を購入できませんでした。");
    } finally {
      setSubmitting(false);
    }
  }

  const pointsAfterPurchase = selectedTitle
    ? totalPoints - selectedTitle.pricePoints
    : totalPoints;

  return (
    <StudentShell userName={initialData.displayName} points={totalPoints}>
      <div className="mx-auto w-full max-w-[1120px]">
        <PageHeading
          eyebrow="TITLE SHOP"
          title="称号ショップ"
          description="学習でためたポイントを使って、新しい称号を手に入れましょう。"
        />

        <section
          aria-label="現在の称号とポイント"
          className="grid gap-5 rounded-xl border border-l-4 border-slate-200 border-l-blue-600 bg-white px-5 py-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500">現在装備中の称号</p>
            <p className="mt-1 truncate text-lg font-black text-slate-950">
              {initialData.currentTitle?.name ?? "未設定"}
            </p>
            <Link
              href="/profile"
              className="mt-1 inline-block text-xs font-black text-blue-700 transition hover:text-blue-900"
            >
              マイページで装備を変更 →
            </Link>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-4 sm:justify-end sm:border-0 sm:pt-0">
            <span className="text-xs font-bold text-slate-500">所持ポイント</span>
            <strong className="text-2xl font-black text-slate-950">{totalPoints} pt</strong>
          </div>
        </section>

        <div className="mb-3 mt-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-black text-slate-950">称号一覧</h2>
          <p className="text-xs font-bold leading-5 text-slate-500 sm:text-right">
            購入した称号は、マイページから装備できます。
            <br />
            称号名・価格は仮データです。
          </p>
        </div>

        <section aria-label="販売中の称号" className="grid gap-3 md:grid-cols-2">
          {titles.map((title) => {
            const insufficient = totalPoints < title.pricePoints;

            return (
              <article
                key={title.id}
                className="flex min-h-32 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-1 items-start justify-between gap-4 px-5 py-4">
                  <h3 className="font-black leading-6 text-slate-950">{title.name}</h3>
                  {title.owned ? (
                    <span className="shrink-0 text-xs font-black text-blue-600">所持済み</span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                  <span className="flex items-baseline gap-1 text-slate-950">
                    <strong className="text-xl font-black">{title.pricePoints}</strong>
                    <span className="text-xs font-bold text-slate-500">pt</span>
                  </span>

                  {title.owned ? (
                    <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-black text-slate-500">
                      所持済み
                    </span>
                  ) : insufficient ? (
                    <span className="text-right">
                      <button
                        type="button"
                        disabled
                        className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-black text-slate-400"
                      >
                        購入できません
                      </button>
                      <span className="mt-1 block text-xs font-black text-rose-600">
                        ポイント不足
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPurchaseDialog(title)}
                      className="min-h-10 rounded-lg bg-blue-600 px-5 text-xs font-black text-white shadow-sm transition hover:bg-blue-700"
                    >
                      購入する
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {message ? (
          <p className="mt-4 text-sm font-black text-emerald-700" role="status">
            {message}
          </p>
        ) : null}
        {error && !selectedTitle ? (
          <p className="mt-4 text-sm font-black text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {selectedTitle ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePurchaseDialog();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-dialog-title"
            aria-describedby="purchase-dialog-description"
            className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <h2 id="purchase-dialog-title" className="font-black text-slate-950">
                称号の購入確認
              </h2>
              <button
                type="button"
                aria-label="閉じる"
                onClick={closePurchaseDialog}
                disabled={submitting}
                className="grid size-9 place-items-center rounded-full border border-slate-200 text-xl text-slate-500 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
              >
                ×
              </button>
            </header>

            <div className="px-5 py-5">
              <p id="purchase-dialog-description" className="text-sm leading-6 text-slate-700">
                「<strong className="font-black text-slate-950">{selectedTitle.name}</strong>」を購入します。
              </p>
              <dl className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-600">現在のポイント</dt>
                  <dd className="font-black text-slate-950">{totalPoints} pt</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-600">使用するポイント</dt>
                  <dd className="font-black text-slate-950">−{selectedTitle.pricePoints} pt</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                  <dt className="font-bold text-slate-700">購入後のポイント</dt>
                  <dd className="font-black text-slate-950">{pointsAfterPurchase} pt</dd>
                </div>
              </dl>
              {error ? (
                <p className="mt-4 text-sm font-black text-rose-700" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="grid gap-2 border-t border-slate-200 px-5 py-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={closePurchaseDialog}
                disabled={submitting}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={purchaseTitle}
                disabled={submitting}
                className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-400"
              >
                {submitting ? "購入しています..." : "購入する"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </StudentShell>
  );
}
