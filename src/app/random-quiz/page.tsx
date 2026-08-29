"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  } | null;
};

async function readError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function fetchRandomQuestion() {
  const response = await fetch("/api/random-quiz", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readError(response, "問題を読み込めませんでした。"));
  }

  const data = (await response.json()) as { question: QuizQuestion };
  return data.question;
}

export default function RandomQuizPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<QuizAnswerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [animateAnswerResult, setAnimateAnswerResult] = useState(false);
  const [error, setError] = useState("");

  async function loadQuestion() {
    setLoading(true);
    setError("");
    setSelectedChoiceId(null);
    setAnswerResult(null);
    setAnimateAnswerResult(false);

    try {
      setQuestion(await fetchRandomQuestion());
    } catch (cause) {
      setQuestion(null);
      setError(cause instanceof Error ? cause.message : "問題を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: MeResponse) => {
        if (active) setMe(data);
      })
      .catch(() => undefined);

    fetchRandomQuestion()
      .then((randomQuestion) => {
        if (active) setQuestion(randomQuestion);
      })
      .catch((cause) => {
        if (!active) return;
        setQuestion(null);
        setError(cause instanceof Error ? cause.message : "問題を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoading(false);
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
      const response = await fetch("/api/random-quiz", {
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

      const data = (await response.json()) as { answer: QuizAnswerResult };
      setAnimateAnswerResult(true);
      setAnswerResult(data.answer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回答を判定できませんでした。");
    } finally {
      setAnswering(false);
    }
  }

  const displayName = me?.displayName;
  const points = me?.profile?.totalPoints ?? 0;

  return (
    <StudentShell userName={displayName} points={points}>
      <div className="mx-auto max-w-[760px] min-w-0">
        <p className="mb-6 text-[15px] font-black text-slate-900">
          好きなペースで、いろいろな過去問に挑戦しましょう。
        </p>

        <QuizQuestionCard
          title="ランダム出題"
          description="ポイント対象外。回答後は何度でも次の問題に進めます。"
          question={question}
          selectedChoiceId={selectedChoiceId}
          answerResult={answerResult}
          animateAnswerResult={animateAnswerResult}
          loading={loading}
          answering={answering}
          error={error}
          onSelectChoice={setSelectedChoiceId}
          onSubmit={submitAnswer}
          headerAction={
            <button
              type="button"
              onClick={loadQuestion}
              disabled={loading}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              別の問題を表示
            </button>
          }
          resultNotice={
            <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
              この回答によるポイント加算はありません。
            </div>
          }
          resultActions={
            <>
              <button
                type="button"
                onClick={loadQuestion}
                className="inline-flex h-12 min-w-48 items-center justify-center rounded-md border border-blue-200 bg-white px-7 text-sm font-black text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                次の問題
              </button>
              <Link
                href="/practice"
                className="inline-flex h-12 min-w-48 items-center justify-center rounded-md bg-blue-600 px-7 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                過去問練習へ
              </Link>
            </>
          }
        />
      </div>
    </StudentShell>
  );
}
