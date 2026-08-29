"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { LearningPeriod } from "@/lib/profile-learning-data";

const periods: Array<{ value: LearningPeriod; label: string }> = [
  { value: "month", label: "今月" },
  { value: "three-months", label: "過去3か月" },
  { value: "all", label: "全期間" },
];

export function LearningFilters({
  period,
  examId,
  exams,
}: {
  period: LearningPeriod;
  examId: string | null;
  exams: Array<{ id: string; name: string }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(nextPeriod: LearningPeriod, nextExamId: string | null) {
    const params = new URLSearchParams();
    if (nextPeriod !== "month") params.set("period", nextPeriod);
    if (nextExamId) params.set("exam", nextExamId);
    const query = params.toString();

    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <section
      aria-label="表示条件"
      aria-busy={isPending}
      className={`flex flex-col gap-4 rounded-lg border border-slate-200 bg-white px-4 py-4 transition sm:flex-row sm:items-center sm:justify-between ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-xs font-black text-slate-600">期間</span>
        <div
          role="group"
          aria-label="集計期間"
          className="grid grid-cols-3 rounded-md border border-slate-300 bg-slate-50 p-1"
        >
          {periods.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              disabled={isPending}
              onClick={() => navigate(option.value, examId)}
              className={`min-h-10 rounded px-3 text-xs font-black transition sm:min-w-24 ${
                period === option.value
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-xs font-black text-slate-600">試験</span>
        <select
          value={examId ?? ""}
          disabled={isPending}
          onChange={(event) => navigate(period, event.target.value || null)}
          className="min-h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:min-w-56"
        >
          <option value="">すべての試験</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
