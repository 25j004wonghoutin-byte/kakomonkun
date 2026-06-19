import type { ReactNode } from "react";

export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <p className="mb-2 text-sm font-black tracking-[0.14em] text-blue-600">{eyebrow}</p>
      <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">{description}</p>
    </div>
  );
}

export function StatusCard({
  label,
  value,
  accent = "blue",
}: {
  label: string;
  value: ReactNode;
  accent?: "blue" | "amber" | "emerald";
}) {
  const accents = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <div className={`mt-2 inline-flex rounded-xl px-3 py-1.5 text-sm font-black ${accents[accent]}`}>
        {value}
      </div>
    </div>
  );
}

export function LoadingCard({ message = "読み込み中です..." }: { message?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto size-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
      <p className="mt-4 font-bold text-slate-600">{message}</p>
    </div>
  );
}

export function ErrorCard({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6">
      <p className="font-black text-rose-800">うまく読み込めませんでした</p>
      <p className="mt-2 text-sm leading-6 text-rose-700">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
