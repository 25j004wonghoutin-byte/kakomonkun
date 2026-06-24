"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StudentShell } from "@/components/student-shell";

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
  category: "ITパスポート",
  text: "次のうち、ROMに関する記述として適切なものはどれか。",
  choices: [
    "電源を切っても内容を書き換えられる。",
    "データの読み出しはできるが、書き込みはできない。",
    "高速にデータを書き換えることができる。",
    "一時的にデータを保存するための記憶装置である。",
  ],
  answerIndex: 1,
  explanation:
    "ROM (Read Only Memory) は、読み出しはできるが書き込みはできない不揮発性の記憶装置です。電源を切っても内容は保持されるため、プログラムやファームウェアの保存に使われます。",
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
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const displayName = me?.displayName ?? "でんせん 太郎";
  const points = me?.profile?.totalPoints ?? 1250;
  const titleCount = 5;
  const isCorrect = selected === dailyQuestion.answerIndex;

  return (
    <StudentShell userName={displayName} points={points}>
      <div className="mx-auto max-w-[980px] min-w-0">
        <p className="mb-6 text-[15px] font-black text-slate-900">
          {displayName}さん、今日も頑張りましょう！
        </p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_230px]">
          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] sm:p-7">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-black text-slate-950">今日の一問一答</h1>
              <span className="rounded-md bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                {dailyQuestion.category}
              </span>
            </div>

            <div className="mt-7">
              <div className="flex min-w-0 gap-4">
                <span className="mt-0.5 text-base font-black text-blue-700">Q.</span>
                <p className="min-w-0 break-words text-sm font-bold leading-7 text-slate-900 [overflow-wrap:anywhere]">
                  {dailyQuestion.text}
                </p>
              </div>

              <div className="mt-4 divide-y divide-slate-200">
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
                      className={`flex min-h-12 w-full items-center gap-3 px-2 py-3 text-left text-sm transition ${
                        correct
                          ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 font-bold text-slate-900"
                          : wrong
                            ? "rounded-md border border-rose-200 bg-rose-50 px-3 font-bold text-slate-900"
                            : "text-slate-700 hover:bg-blue-50"
                      }`}
                    >
                      <span
                        className={`grid size-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                          chosen || correct
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-400 bg-white text-slate-500"
                        }`}
                      >
                        {chosen || correct ? "●" : ""}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{index + 1}</span>
                      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{choice}</span>
                      {correct ? (
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-black text-white">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {!submitted ? (
                <div className="mt-7 flex flex-col items-start gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-bold text-slate-500">
                    選択肢を選んでから回答してください。
                  </p>
                  <button
                    type="button"
                    disabled={selected === null}
                    onClick={() => setSubmitted(true)}
                    className="inline-flex h-11 min-w-36 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    回答する
                  </button>
                </div>
              ) : (
                <div className="mt-7 border-t border-slate-200 pt-6">
                  <div className="flex gap-4">
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-full text-2xl font-black text-white ${
                        isCorrect ? "bg-emerald-600" : "bg-rose-600"
                      }`}
                    >
                      {isCorrect ? "✓" : "!"}
                    </span>
                    <div>
                      <p className={`text-lg font-black ${isCorrect ? "text-emerald-700" : "text-rose-700"}`}>
                        {isCorrect ? "正解！" : "不正解"}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-700">
                        正解は {dailyQuestion.answerIndex + 1} です。
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-emerald-700">
                      <span className="grid size-6 place-items-center rounded-full bg-emerald-600 text-white">!</span>
                      解説
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-700">{dailyQuestion.explanation}</p>
                  </div>

                  <div className="mt-6 flex justify-center">
                    <Link
                      href="/practice"
                      className="inline-flex h-12 min-w-64 items-center justify-center gap-6 rounded-md bg-blue-600 px-7 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
                    >
                      過去問練習へ
                      <span aria-hidden="true" className="text-xl leading-none">
                        →
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)]">
            <h2 className="text-base font-black text-slate-950">所持情報</h2>
            <div className="mt-4 space-y-2">
              <StatusTile icon="point" label="所持ポイント" value={`${points.toLocaleString()} pt`} />
              <StatusTile icon="title" label="所持称号" value={`${titleCount} 個`} />
            </div>
          </aside>
        </div>
      </div>
    </StudentShell>
  );
}

function StatusTile({
  icon,
  label,
  value,
}: {
  icon: "point" | "title";
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100">
        {icon === "point" ? <PointIcon /> : <TitleIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-500">{label}</span>
        <span className="mt-1 block text-right text-lg font-black text-slate-950">{value}</span>
      </span>
    </div>
  );
}

function PointIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8">
      <circle cx="16" cy="16" r="13" fill="#f59e0b" />
      <circle cx="16" cy="16" r="10" fill="#fbbf24" stroke="#fff7ed" strokeWidth="2" />
      <path d="M12 22V10h5.2c2.8 0 4.8 1.8 4.8 4.4s-2 4.4-4.8 4.4h-2V22h-3.2Zm3.2-6h1.6c1.2 0 2-.6 2-1.6s-.8-1.6-2-1.6h-1.6V16Z" fill="#fff7ed" />
    </svg>
  );
}

function TitleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8">
      <path d="M16 3 19.2 8l5.8-.5-.5 5.8 5 3.2-5 3.2.5 5.8-5.8-.5L16 30l-3.2-5-5.8.5.5-5.8-5-3.2 5-3.2L7 7.5l5.8.5L16 3Z" fill="#f59e0b" />
      <circle cx="16" cy="16" r="7" fill="#fef3c7" />
      <path d="m16 11 1.4 3 3.2.4-2.3 2.2.5 3.2L16 18.3l-2.8 1.5.5-3.2-2.3-2.2 3.2-.4L16 11Z" fill="#f59e0b" />
    </svg>
  );
}
