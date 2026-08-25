"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AiExplanationMarkdown } from "@/components/ai-explanation-markdown";
import {
  QuizQuestionCard,
  type QuizAnswerResult,
  type QuizQuestion,
} from "@/components/quiz-question-card";
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

type DailyAnswer = QuizAnswerResult & {
  selectedChoiceId: string;
  awardedPoints: number;
};

type DailyQuestionResponse = {
  date: string;
  question: QuizQuestion;
  answer: DailyAnswer | null;
  totalPoints: number | null;
  alreadyAnswered?: boolean;
};

type AiExplanationResult = {
  explanation: string;
  fromCache: boolean;
  modelName: string;
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

  return (await response.json()) as DailyQuestionResponse;
}

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<DailyAnswer | null>(null);
  const [aiExplanation, setAiExplanation] = useState<AiExplanationResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [questionLoading, setQuestionLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: MeResponse) => {
        if (active) setMe(data);
      })
      .catch(() => undefined);

    fetchDailyQuestion()
      .then((data) => {
        if (!active) return;
        setQuestion(data.question);
        setSelectedChoiceId(data.answer?.selectedChoiceId ?? null);
        setAnswerResult(data.answer);
        if (data.totalPoints !== null) {
          setMe((current) =>
            current?.profile
              ? {
                  ...current,
                  profile: { ...current.profile, totalPoints: data.totalPoints! },
                }
              : current,
          );
        }
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
    if (!question || !selectedChoiceId || answerResult) return;

    setAnswering(true);
    setError("");

    try {
      const response = await fetch("/api/daily-qa/answer", {
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

      const data = (await response.json()) as DailyQuestionResponse;
      setQuestion(data.question);
      setSelectedChoiceId(data.answer?.selectedChoiceId ?? selectedChoiceId);
      setAnswerResult(data.answer);
      if (data.totalPoints !== null) {
        setMe((current) =>
          current?.profile
            ? {
                ...current,
                profile: { ...current.profile, totalPoints: data.totalPoints! },
              }
            : current,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回答を判定できませんでした。");
    } finally {
      setAnswering(false);
    }
  }

  async function loadAiExplanation() {
    if (!question || !answerResult) return;

    setAiLoading(true);
    setAiError("");

    try {
      const response = await fetch("/api/ai/explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "AI解説を取得できませんでした。");
      }
      if (typeof data.explanation !== "string") {
        throw new Error("AI解説の形式が不正です。");
      }

      setAiExplanation({
        explanation: data.explanation,
        fromCache: Boolean(data.fromCache),
        modelName: typeof data.modelName === "string" ? data.modelName : "Gemini",
      });
    } catch (cause) {
      setAiError(cause instanceof Error ? cause.message : "AI解説を取得できませんでした。");
    } finally {
      setAiLoading(false);
    }
  }

  const displayName = me?.displayName;
  const points = me?.profile?.totalPoints ?? 0;
  const titleCount = 0;

  return (
    <StudentShell userName={displayName} points={points}>
      <div className="mx-auto max-w-[980px] min-w-0">
        <p className="mb-6 text-[15px] font-black text-slate-900">
          {displayName ? `${displayName}さん` : "今日も"}、一問ずつ積み上げましょう。
        </p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_230px]">
          <QuizQuestionCard
            title="今日の一問一答"
            description="毎日0時（日本時間）に更新され、回答は1日1回だけ記録されます。"
            question={question}
            selectedChoiceId={selectedChoiceId}
            answerResult={answerResult}
            loading={questionLoading}
            answering={answering}
            error={error}
            onSelectChoice={setSelectedChoiceId}
            onSubmit={submitAnswer}
            resultNotice={
              answerResult ? (
                <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
                  {answerResult.awardedPoints > 0
                    ? `本日の獲得 +${answerResult.awardedPoints} pt`
                    : "本日の回答を記録しました。"}
                </div>
              ) : null
            }
            resultExtra={
              answerResult ? (
                <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-sky-900">AI解説補助</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-sky-700">
                        この解説はAIによる補助説明です。内容が不正確な場合があります。
                      </p>
                    </div>
                    {aiExplanation ? (
                      <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-black text-sky-700 ring-1 ring-sky-200">
                        {aiExplanation.fromCache ? "保存済み" : "新規生成"} / {aiExplanation.modelName}
                      </span>
                    ) : null}
                  </div>

                  {aiExplanation ? (
                    <AiExplanationMarkdown text={aiExplanation.explanation} className="mt-4" />
                  ) : (
                    <button
                      type="button"
                      onClick={loadAiExplanation}
                      disabled={aiLoading}
                      className="mt-4 rounded-md bg-sky-600 px-5 py-3 text-sm font-black text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {aiLoading ? "AI解説を作成中..." : "AI解説を作成する"}
                    </button>
                  )}

                  {aiError ? <p className="mt-3 text-sm font-bold text-rose-700">{aiError}</p> : null}
                </div>
              ) : null
            }
            resultActions={
              <>
                <Link
                  href="/random-quiz"
                  className="inline-flex h-12 min-w-48 items-center justify-center rounded-md border border-blue-200 bg-white px-7 text-sm font-black text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  ランダム出題へ
                </Link>
                <Link
                  href="/practice"
                  className="inline-flex h-12 min-w-64 items-center justify-center gap-6 rounded-md bg-blue-600 px-7 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  過去問練習へ
                  <span aria-hidden="true" className="text-xl leading-none">
                    →
                  </span>
                </Link>
              </>
            }
          />

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
