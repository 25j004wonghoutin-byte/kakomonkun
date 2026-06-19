"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StudentShell } from "@/components/student-shell";
import { ErrorCard, LoadingCard } from "@/components/ui";

type ResultSession = {
  exam: { name: string };
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  earnedPoints: number;
};

export default function PracticeResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<ResultSession | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/practice/sessions/${sessionId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "結果を読み込めませんでした。");
        return data;
      })
      .then(setSession)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "結果を読み込めませんでした。"));
  }, [sessionId]);

  if (error) {
    return (
      <StudentShell>
        <ErrorCard message={error} />
      </StudentShell>
    );
  }

  if (!session) {
    return (
      <StudentShell>
        <LoadingCard message="結果を集計しています..." />
      </StudentShell>
    );
  }

  const accuracy =
    session.answeredCount > 0 ? Math.round((session.correctCount / session.answeredCount) * 100) : 0;

  return (
    <StudentShell>
      <div className="mx-auto max-w-3xl">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-center shadow-xl">
          <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 px-6 py-10 text-white">
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-white/20 text-4xl backdrop-blur">
              🎉
            </div>
            <p className="mt-5 text-sm font-black tracking-[0.16em] text-blue-100">PRACTICE COMPLETE</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">練習おつかれさまでした！</h1>
            <p className="mt-2 font-bold text-blue-50">{session.exam.name}</p>
          </div>

          <div className="p-6 sm:p-10">
            <div className="grid gap-4 sm:grid-cols-3">
              <ResultMetric label="正解数" value={`${session.correctCount} / ${session.answeredCount}`} />
              <ResultMetric label="正答率" value={`${accuracy}%`} />
              <ResultMetric label="獲得ポイント" value={`${session.earnedPoints} pt`} highlight />
            </div>

            <div className="mt-8 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                style={{ width: `${accuracy}%` }}
              />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-500">
              {accuracy >= 80
                ? "すばらしい結果です。この調子で続けましょう。"
                : accuracy >= 50
                  ? "よい調子です。間違えた問題を振り返ってみましょう。"
                  : "一歩ずつで大丈夫。繰り返すほど力になります。"}
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/practice"
                className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white transition hover:bg-blue-700"
              >
                もう一度練習
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-slate-300 px-6 py-3 font-black text-slate-700 transition hover:bg-slate-100"
              >
                ホームへ戻る
              </Link>
            </div>
          </div>
        </section>
      </div>
    </StudentShell>
  );
}

function ResultMetric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 ${highlight ? "bg-amber-50" : "bg-slate-50"}`}>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${highlight ? "text-amber-600" : "text-slate-950"}`}>
        {value}
      </p>
    </div>
  );
}
