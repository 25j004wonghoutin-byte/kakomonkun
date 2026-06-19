"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StudentShell } from "@/components/student-shell";
import { ErrorCard, PageHeading } from "@/components/ui";

const exams = [
  {
    code: "it_passport",
    shortName: "ITパスポート",
    description: "ITの基礎知識を幅広く確認します。",
    color: "from-blue-600 to-cyan-500",
  },
  {
    code: "fe",
    shortName: "基本情報技術者",
    description: "科目Aの基礎問題に挑戦します。",
    color: "from-violet-600 to-fuchsia-500",
  },
];

export default function PracticeStartPage() {
  const router = useRouter();
  const [selectedExam, setSelectedExam] = useState("it_passport");
  const [userName, setUserName] = useState("デモ学生");
  const [points, setPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        setUserName(data.displayName);
        setPoints(data.profile?.totalPoints ?? 0);
      })
      .catch(() => undefined);
  }, []);

  async function startPractice() {
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examCode: selectedExam, questionCount: 3 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "練習を開始できませんでした。");
      router.push(`/practice/${data.sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "練習を開始できませんでした。");
      setSubmitting(false);
    }
  }

  return (
    <StudentShell userName={userName} points={points}>
      <PageHeading
        eyebrow="PAST QUESTIONS"
        title="過去問練習"
        description="挑戦する試験を選んでください。現在は動作確認用の3問コースです。"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {exams.map((exam) => {
          const selected = selectedExam === exam.code;
          return (
            <button
              key={exam.code}
              type="button"
              onClick={() => setSelectedExam(exam.code)}
              className={`group overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${
                selected ? "border-blue-500 ring-4 ring-blue-100" : "border-slate-200"
              }`}
            >
              <div className={`h-3 bg-gradient-to-r ${exam.color}`} />
              <div className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black tracking-[0.14em] text-slate-400">EXAM</p>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">{exam.shortName}</h2>
                  </div>
                  <span
                    className={`grid size-7 place-items-center rounded-full border-2 ${
                      selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"
                    }`}
                  >
                    {selected ? "✓" : ""}
                  </span>
                </div>
                <p className="mt-4 leading-7 text-slate-600">{exam.description}</p>
                <div className="mt-6 flex gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    全3問
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    選択式
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-lg font-black text-slate-950">練習について</h3>
        <ul className="mt-4 grid gap-3 text-sm font-medium text-slate-600 sm:grid-cols-3">
          <li className="rounded-2xl bg-slate-50 p-4">回答後すぐに正誤を確認</li>
          <li className="rounded-2xl bg-slate-50 p-4">途中で終了しても回答を保存</li>
          <li className="rounded-2xl bg-slate-50 p-4">完了すると条件に応じてポイント獲得</li>
        </ul>

        {error ? <div className="mt-5"><ErrorCard message={error} /></div> : null}

        <button
          type="button"
          onClick={startPractice}
          disabled={submitting}
          className="mt-6 w-full rounded-2xl bg-blue-600 px-6 py-4 text-lg font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-400 sm:w-auto"
        >
          {submitting ? "準備しています..." : "練習を開始する"}
        </button>
      </div>
    </StudentShell>
  );
}
