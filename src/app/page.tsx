"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QuestionChoiceContent } from "@/components/question-choice-content";
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

type DailyQuestion = {
  id: string;
  text: string;
  imagePath: string | null;
  explanation: string | null;
  exam: {
    code: string;
    name: string;
  };
  category: {
    code: string;
    name: string;
  };
  choices: Array<{
    id: string;
    label: string;
    text: string;
  }>;
};

type DailyQuestionResponse = {
  question: DailyQuestion;
};

type AnswerResult = {
  isCorrect: boolean;
  explanation: string | null;
  correctChoice: {
    id: string;
    label: string;
    text: string;
  };
};

async function readError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function fetchDailyQuestion() {
  const response = await fetch("/api/daily-qa", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readError(response, "一問一答を読み込めませんでした。"));
  }

  const data = (await response.json()) as DailyQuestionResponse;
  return data.question;
}

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [questionLoading, setQuestionLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");

  const loadQuestion = useCallback(async () => {
    setQuestionLoading(true);
    setError("");
    setSelectedChoiceId(null);
    setAnswerResult(null);

    try {
      setQuestion(await fetchDailyQuestion());
    } catch (cause) {
      setQuestion(null);
      setError(cause instanceof Error ? cause.message : "一問一答を読み込めませんでした。");
    } finally {
      setQuestionLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: MeResponse) => {
        if (active) setMe(data);
      })
      .catch(() => undefined);

    fetchDailyQuestion()
      .then((dailyQuestion) => {
        if (active) setQuestion(dailyQuestion);
      })
      .catch((cause) => {
        if (!active) return;
        setQuestion(null);
        setError(cause instanceof Error ? cause.message : "一問一答を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setQuestionLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submitAnswer() {
    if (!question || !selectedChoiceId) return;

    setAnswering(true);
    setError("");

    try {
      const response = await fetch("/api/daily-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          selectedChoiceId,
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "回答を判定できませんでした。"));
      }

      setAnswerResult((await response.json()) as AnswerResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回答を判定できませんでした。");
    } finally {
      setAnswering(false);
    }
  }

  const displayName = me?.displayName ?? "学生";
  const points = me?.profile?.totalPoints ?? 0;
  const titleCount = 0;

  return (
    <StudentShell userName={displayName} points={points}>
      <div className="mx-auto max-w-[980px] min-w-0">
        <p className="mb-6 text-[15px] font-black text-slate-900">
          {displayName}さん、今日も一問ずつ積み上げましょう。
        </p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_230px]">
          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-black text-slate-950">今日の一問一答</h1>
                {question ? (
                  <>
                    <span className="rounded-md bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                      {question.exam.name}
                    </span>
                    <span className="rounded-md bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                      {question.category.name}
                    </span>
                  </>
                ) : null}
              </div>

              <button
                type="button"
                onClick={loadQuestion}
                disabled={questionLoading}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
              >
                別の問題を表示
              </button>
            </div>

            <p className="mt-3 text-xs font-bold text-slate-500">
              テスト中のため、リロードや再表示のたびにランダムで問題を出します。
            </p>

            {error ? (
              <div role="alert" className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                {error}
              </div>
            ) : null}

            {questionLoading ? (
              <div className="mt-7 rounded-md border border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-500">
                問題を読み込んでいます...
              </div>
            ) : question ? (
              <div className="mt-7">
                <div className="flex min-w-0 gap-4">
                  <span className="mt-0.5 text-base font-black text-blue-700">Q.</span>
                  <p className="min-w-0 whitespace-pre-wrap break-words text-sm font-bold leading-7 text-slate-900 [overflow-wrap:anywhere]">
                    {question.text}
                  </p>
                </div>

                {question.imagePath ? (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <Image
                      src={question.imagePath}
                      alt="問題画像"
                      width={900}
                      height={520}
                      className="mx-auto h-auto max-h-[520px] w-auto max-w-full object-contain"
                    />
                  </div>
                ) : null}

                <div className="mt-4 divide-y divide-slate-200">
                  {question.choices.map((choice) => {
                    const chosen = selectedChoiceId === choice.id;
                    const correct = answerResult?.correctChoice.id === choice.id;
                    const wrong = Boolean(answerResult && chosen && !correct);

                    return (
                      <button
                        key={choice.id}
                        type="button"
                        disabled={Boolean(answerResult) || answering}
                        onClick={() => setSelectedChoiceId(choice.id)}
                        className={`flex min-h-12 w-full items-center gap-3 px-2 py-3 text-left text-sm transition ${
                          correct
                            ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 font-bold text-slate-900"
                            : wrong
                              ? "rounded-md border border-rose-200 bg-rose-50 px-3 font-bold text-slate-900"
                              : "text-slate-700 hover:bg-blue-50 disabled:hover:bg-transparent"
                        }`}
                      >
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                            chosen || correct
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-slate-400 bg-white text-slate-500"
                          }`}
                        >
                          {chosen || correct ? "✓" : ""}
                        </span>
                        <span className="shrink-0 text-xs font-black text-slate-500">{choice.label}</span>
                        <QuestionChoiceContent text={choice.text} label={choice.label} />
                        {correct ? (
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-black text-white">
                            正
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {!answerResult ? (
                  <div className="mt-7 flex flex-col items-start gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-bold text-slate-500">
                      選択肢を選んでから回答してください。
                    </p>
                    <button
                      type="button"
                      disabled={!selectedChoiceId || answering}
                      onClick={submitAnswer}
                      className="inline-flex h-11 min-w-36 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                    >
                      {answering ? "判定中..." : "回答する"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-7 border-t border-slate-200 pt-6">
                    <div className="flex gap-4">
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-full text-2xl font-black text-white ${
                          answerResult.isCorrect ? "bg-emerald-600" : "bg-rose-600"
                        }`}
                      >
                        {answerResult.isCorrect ? "✓" : "!"}
                      </span>
                      <div>
                        <p className={`text-lg font-black ${answerResult.isCorrect ? "text-emerald-700" : "text-rose-700"}`}>
                          {answerResult.isCorrect ? "正解！" : "不正解"}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-700">
                          正解は {answerResult.correctChoice.label} です。
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-black text-emerald-700">
                        <span className="grid size-6 place-items-center rounded-full bg-emerald-600 text-white">!</span>
                        解説
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {answerResult.explanation ?? "この問題の解説はまだ登録されていません。"}
                      </p>
                    </div>

                    <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={loadQuestion}
                        className="inline-flex h-12 min-w-48 items-center justify-center rounded-md border border-blue-200 bg-white px-7 text-sm font-black text-blue-700 transition hover:bg-blue-50"
                      >
                        もう一問
                      </button>
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
            ) : (
              <div className="mt-7 rounded-md border border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-500">
                表示できる問題がありません。
              </div>
            )}
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
      <path
        d="M12 22V10h5.2c2.8 0 4.8 1.8 4.8 4.4s-2 4.4-4.8 4.4h-2V22h-3.2Zm3.2-6h1.6c1.2 0 2-.6 2-1.6s-.8-1.6-2-1.6h-1.6V16Z"
        fill="#fff7ed"
      />
    </svg>
  );
}

function TitleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8">
      <path
        d="M16 3 19.2 8l5.8-.5-.5 5.8 5 3.2-5 3.2.5 5.8-5.8-.5L16 30l-3.2-5-5.8.5.5-5.8-5-3.2 5-3.2L7 7.5l5.8.5L16 3Z"
        fill="#f59e0b"
      />
      <circle cx="16" cy="16" r="7" fill="#fef3c7" />
      <path d="m16 11 1.4 3 3.2.4-2.3 2.2.5 3.2L16 18.3l-2.8 1.5.5-3.2-2.3-2.2 3.2-.4L16 11Z" fill="#f59e0b" />
    </svg>
  );
}
