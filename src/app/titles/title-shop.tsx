"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StudentShell } from "@/components/student-shell";
import { PageHeading } from "@/components/ui";
import { readJsonResponse } from "@/lib/read-json-response";
import type { TitleShopItem } from "@/lib/titles/contract";
import { titleShopAction } from "@/lib/titles/shop";
import { TitleShopCard, TitleShopDialog } from "./title-shop-parts";

export type TitleShopInitialData = {
  displayName: string;
  totalPoints: number;
  currentTitle: { id: string; name: string } | null;
  titles: TitleShopItem[];
};
type PurchaseResponse = { error?: string; title?: { id: string; name: string }; totalPoints?: number };

export function TitleShop({ initialData }: { initialData: TitleShopInitialData }) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<{ base: TitleShopInitialData; ownedIds: string[]; totalPoints: number } | null>(null);
  const totalPoints = optimistic?.base === initialData ? optimistic.totalPoints : initialData.totalPoints;
  const titles = initialData.titles.map((title) => optimistic?.base === initialData && optimistic.ownedIds.includes(title.id) ? { ...title, owned: true, state: "owned" as const } : title);
  const [selected, setSelected] = useState<{ title: TitleShopItem; kind: "condition" | "purchase" } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selected) return;
    confirmButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setSelected(null);
        requestAnimationFrame(() => openerRef.current?.focus());
      }
      if (event.key === "Tab") {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [selected, submitting]);

  function selectTitle(title: TitleShopItem, button: HTMLButtonElement) {
    const action = titleShopAction(title, totalPoints);
    if (action === "none") return;
    openerRef.current = button;
    setMessage("");
    setError("");
    setSelected({ title, kind: action });
  }
  function closeDialog() {
    if (submitting) return;
    setSelected(null);
    requestAnimationFrame(() => {
      if (openerRef.current?.disabled) (openerRef.current.closest("article") as HTMLElement | null)?.focus();
      else openerRef.current?.focus();
    });
  }
  async function purchaseTitle() {
    if (!selected || selected.kind !== "purchase" || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/titles/purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titleId: selected.title.id }) });
      const data = await readJsonResponse<PurchaseResponse>(response);
      if (!response.ok || typeof data?.totalPoints !== "number") throw new Error(data?.error ?? "称号を購入できませんでした。");
      const newPoints = data.totalPoints;
      setOptimistic((current) => ({ base: initialData, ownedIds: [...(current?.base === initialData ? current.ownedIds : []), selected.title.id], totalPoints: newPoints }));
      setMessage(`「${selected.title.name}」を購入しました。`);
      setSelected(null);
      requestAnimationFrame(() => (openerRef.current?.closest("article") as HTMLElement | null)?.focus());
      // 20種類・対象58種類の購入直後アンロックも最新のserver propsへ反映する。
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "称号を購入できませんでした。");
    } finally { setSubmitting(false); }
  }

  return (
    <StudentShell userName={initialData.displayName} points={totalPoints}>
      <div className="mx-auto w-full max-w-[1120px]">
        <PageHeading eyebrow="TITLE SHOP" title="称号ショップ" description="学習でためたポイントや、達成した条件で新しい称号を手に入れましょう。" />
        <section aria-label="現在の称号とポイント" className="grid gap-5 rounded-xl border border-l-4 border-slate-200 border-l-blue-600 bg-white px-5 py-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500">現在装備中の称号</p>
            <p className="mt-1 truncate text-lg font-black text-slate-950">{initialData.currentTitle?.name ?? "未設定"}</p>
            <Link href="/profile" className="mt-1 inline-block text-xs font-black text-blue-700 transition hover:text-blue-900">マイページで装備を変更 →</Link>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-4 sm:justify-end sm:border-0 sm:pt-0">
            <span className="text-xs font-bold text-slate-500">所持ポイント</span><strong className="text-2xl font-black text-slate-950">{totalPoints} pt</strong>
          </div>
        </section>
        <div className="mb-3 mt-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-black text-slate-950">称号一覧</h2>
          <p className="text-xs font-bold leading-5 text-slate-500 sm:text-right">購入した称号は、マイページから装備できます。<br />称号名・価格は暫定値です。</p>
        </div>
        <section aria-label="販売中の称号" className="grid gap-3 md:grid-cols-2">
          {titles.map((title) => <TitleShopCard key={title.id} title={title} totalPoints={totalPoints} onSelect={selectTitle} />)}
        </section>
        {message ? <p className="mt-4 text-sm font-black text-emerald-700" role="status">{message}</p> : null}
        {error && !selected ? <p className="mt-4 text-sm font-black text-rose-700" role="alert">{error}</p> : null}
      </div>
      {selected ? <TitleShopDialog title={selected.title} kind={selected.kind} totalPoints={totalPoints} submitting={submitting} error={error} onClose={closeDialog} onPurchase={purchaseTitle} confirmRef={confirmButtonRef} dialogRef={dialogRef} /> : null}
    </StudentShell>
  );
}
