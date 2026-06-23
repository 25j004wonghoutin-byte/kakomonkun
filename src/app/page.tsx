"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StudentShell } from "@/components/student-shell";
import { PageHeading, StatusCard } from "@/components/ui";

type MeResponse = {
  displayName: string;
  profile: {
    totalPoints: number;
    totalPracticeCount: number;
    totalCorrectCount: number;
    totalAnswerCount: number;
  } | null;
};

const dailyQuestion = {
  text: "OSI基本参照モデルのトランスポート層で動作するプロトコルはどれか？",
  choices: ["IP", "HTTP", "TCP", "Ethernet"],
  answerIndex: 2,
  explanation: "TCPはトランスポート層で、信頼性のあるデータ転送を提供します。",
};

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: MeResponse) => {
        if (active) setMe(data);
      })
      .catch(() => {
        // 一時的な通信失敗時は初期表示を維持する。
      });
    return () => {
      active = false;
    };
  }, []);

  const points = me?.profile?.totalPoints ?? 0;
  const isCorrect = selected === dailyQuestion.answerIndex;

  return (
    <StudentShell userName={me?.displayName} points={points}>
      <PageHeading
        eyebrow="STUDENT HOME"
        title={`${me?.displayName ?? "学生"}さん、今日も一歩進みましょう`}
        description="まずは今日の一問から。短い積み重ねが、合格へのいちばん確かな近道です。"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_20px_60px_-30px_rgba(37,99,235,0.45)]">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-5 text-white sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.18em] text-blue-100">DAILY QUESTION</p>
                <h2 className="mt-1 text-2xl font-black">今日の一問一答</h2>
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
                テクノロジ系
              </span>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <p className="text-lg font-bold leading-8 text-slate-900">{dailyQuestion.text}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {dailyQuestion.choices.map((choice, index) => {
                const chosen = selected === index;
                const correct = submitted && index === dailyQuestion.answerIndex;
                const wrong = submitted && chosen && !correct;

                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={submitted}
                    onClick={() => setSelected(index)}
                    className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left font-bold transition ${
                      correct
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : wrong
                          ? "border-rose-400 bg-rose-50 text-rose-800"
                          : chosen
                            ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-100"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
                    }`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-black">
                      {String.fromCharCode(65 + index)}
                    </span>
                    {choice}
                  </button>
                );
              })}
            </div>

            {!submitted ? (
              <button
                type="button"
                disabled={selected === null}
                onClick={() => setSubmitted(true)}
                className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-4 font-black text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                回答する
              </button>
            ) : (
              <div
                className={`mt-6 rounded-2xl border p-5 ${
                  isCorrect
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-rose-200 bg-rose-50"
                }`}
              >
                <p className={`font-black ${isCorrect ? "text-emerald-800" : "text-rose-800"}`}>
                  {isCorrect ? "正解です！" : "惜しい！ 正解は C です。"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{dailyQuestion.explanation}</p>
                <Link
                  href="/practice"
                  className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700"
                >
                  過去問練習へ進む
                </Link>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <StatusCard label="現在ポイント" value={`${points} pt`} accent="amber" />
          <StatusCard label="現在の称号" value="はじめの一歩" accent="blue" />
          <StatusCard
            label="練習回数"
            value={`${me?.profile?.totalPracticeCount ?? 0} 回`}
            accent="emerald"
          />

          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <p className="text-xs font-black tracking-[0.16em] text-cyan-300">NEXT ACTION</p>
            <h3 className="mt-2 text-xl font-black">3問だけ、解いてみる</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              テスト版の短い練習です。正誤と解説を確認しながら進められます。
            </p>
            <Link
              href="/practice"
              className="mt-5 inline-flex w-full justify-center rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
            >
              練習を始める
            </Link>
          </div>
        </aside>
      </div>
    </StudentShell>
  );
}
