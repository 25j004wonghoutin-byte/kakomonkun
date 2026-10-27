"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HomeStudyTotals } from "@/components/home-study-totals";
import type { MePayload } from "@/lib/me";
import { createMeLoader, mergeMePoints, observeMeRefresh } from "@/lib/me-client";
import { AiExplanationMarkdown } from "@/components/ai-explanation-markdown";
import {
  QuizQuestionCard,
  type QuizAnswerResult,
  type QuizQuestion,
} from "@/components/quiz-question-card";
import { StudentShell } from "@/components/student-shell";

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

export function StudentHome() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState("");
  const meLoader = useRef<ReturnType<typeof createMeLoader> | null>(null);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<DailyAnswer | null>(null);
  const [aiExplanation, setAiExplanation] = useState<AiExplanationResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [questionLoading, setQuestionLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [animateAnswerResult, setAnimateAnswerResult] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loader = createMeLoader({
      fetchMe: async (signal) => {
        const response = await fetch("/api/me", { cache: "no-store", signal });
        if (!response.ok) throw new Error("me request failed");
        return response.json() as Promise<MePayload>;
      },
      onData: setMe,
      onError: setMeError,
      onLoading: setMeLoading,
    });
    meLoader.current = loader;
    const removeRefreshListeners = observeMeRefresh(() => { void loader.load(); }, window, document);
    void loader.load();

    fetchDailyQuestion()
      .then((data) => {
        if (!active) return;
        setQuestion(data.question);
        setSelectedChoiceId(data.answer?.selectedChoiceId ?? null);
        setAnswerResult(data.answer);
        if (data.totalPoints !== null) {
          setMe((current) => mergeMePoints(current, data.totalPoints!));
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
      removeRefreshListeners();
      loader.dispose();
      meLoader.current = null;
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
      setAnimateAnswerResult(true);
      setQuestion(data.question);
      setSelectedChoiceId(data.answer?.selectedChoiceId ?? selectedChoiceId);
      setAnswerResult(data.answer);
      if (data.totalPoints !== null) {
        setMe((current) => mergeMePoints(current, data.totalPoints!));
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

  return (
    <StudentShell userName={displayName} points={points}>
      <div className="min-w-0">
        <div className="study-grid">
          <QuizQuestionCard
            title="今日の一問一答"
            description="毎日0時更新（日本時間）・1日1回"
            question={question}
            selectedChoiceId={selectedChoiceId}
            answerResult={answerResult}
            animateAnswerResult={animateAnswerResult}
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
                      <p className="text-sm font-black text-sky-900">AI解説</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-sky-700">
                        AIによる解説です。内容が不正確な場合があります。
                      </p>
                    </div>
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
                  className="inline-flex h-12 min-w-64 items-center justify-center gap-6 rounded-md bg-blue-600 px-7 text-sm font-black text-white   transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  過去問練習へ
                  <span aria-hidden="true" className="text-xl leading-none">
                    →
                  </span>
                </Link>
              </>
            }
          />

          <aside className="study-rail" aria-label="学習状況">
            <HomeStudyTotals profile={me?.profile ?? null} loading={meLoading} error={meError} onRetry={() => { void meLoader.current?.load(); }} />
            <section className="study-next" aria-labelledby="study-next-heading">
              <h2 id="study-next-heading">学習を続ける</h2>
              <Link href="/practice">過去問練習 <NextArrow /></Link>
              <Link href="/random-quiz">ランダム出題 <NextArrow /></Link>
              <Link href="/mock-exam">模擬試験 <NextArrow /></Link>
            </section>
          </aside>
        </div>
      </div>
    </StudentShell>
  );
}

function NextArrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}
