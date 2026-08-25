"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AiExplanationMarkdown } from "@/components/ai-explanation-markdown";
import { QuestionChoiceContent } from "@/components/question-choice-content";
import { StudentShell } from "@/components/student-shell";
import { ErrorCard, LoadingCard } from "@/components/ui";
import { readJsonResponse } from "@/lib/read-json-response";

type Choice = {
  id: string;
  choiceLabel: string;
  choiceText: string;
  sortOrder: number;
};

type CorrectChoice = {
  id: string;
  choiceLabel: string;
  choiceText: string;
};

type PracticeAnswerResult = {
  selectedChoiceId: string;
  isCorrect: boolean;
  correctChoice: CorrectChoice | null;
  explanation?: string | null;
};

type PracticeQuestion = {
  id: string;
  orderNo: number;
  text: string;
  imagePath: string | null;
  category: {
    code: string;
    name: string;
  };
  choices: Choice[];
  answer: PracticeAnswerResult | null;
};

type Session = {
  id: string;
  status: string;
  exam: { code: string; name: string };
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  questions: PracticeQuestion[];
};

type AiExplanationResult = {
  explanation: string;
  fromCache: boolean;
  modelName: string;
};

export default function PracticeSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [answerResult, setAnswerResult] = useState<PracticeAnswerResult | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, AiExplanationResult>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const [aiLoadingQuestionId, setAiLoadingQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/practice/sessions/${sessionId}`)
      .then(async (response) => {
        const data = await readJsonResponse<Session & { error?: string }>(response);
        if (!response.ok) throw new Error(data?.error ?? "練習を読み込めませんでした。");
        if (!data) throw new Error("練習を読み込めませんでした。");
        return data;
      })
      .then((data: Session) => {
        setSession(data);
        const firstUnanswered = data.questions.findIndex((question) => !question.answer);
        const index = firstUnanswered === -1 ? Math.max(0, data.questions.length - 1) : firstUnanswered;
        setCurrentIndex(index);
        setSelectedChoice(data.questions[index]?.answer?.selectedChoiceId ?? "");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "読み込みに失敗しました。"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const question = session?.questions[currentIndex];
  const progress = useMemo(
    () => (session ? Math.round((session.answeredCount / session.questionCount) * 100) : 0),
    [session],
  );

  async function submitAnswer() {
    if (!question || !selectedChoice) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/practice/sessions/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          selectedChoiceId: selectedChoice,
        }),
      });
      const data = await readJsonResponse<PracticeAnswerResult & { error?: string }>(response);
      if (!response.ok) throw new Error(data?.error ?? "回答を保存できませんでした。");
      if (!data) throw new Error("回答を保存できませんでした。");

      setAnswerResult(data);
      setSession((current) =>
        current
          ? {
              ...current,
              answeredCount: current.answeredCount + 1,
              correctCount: current.correctCount + (data.isCorrect ? 1 : 0),
              questions: current.questions.map((item) =>
                item.id === question.id
                  ? {
                      ...item,
                      answer: {
                        selectedChoiceId: selectedChoice,
                        isCorrect: data.isCorrect,
                        correctChoice: data.correctChoice ?? null,
                        explanation: data.explanation ?? null,
                      },
                    }
                  : item,
              ),
            }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回答を保存できませんでした。");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadAiExplanation() {
    if (!question || !(answerResult || question.answer)) return;

    setAiLoadingQuestionId(question.id);
    setAiErrors((current) => {
      const next = { ...current };
      delete next[question.id];
      return next;
    });

    try {
      const response = await fetch(`/api/practice/sessions/${sessionId}/ai-explanation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id }),
      });
      const data = await readJsonResponse<AiExplanationResult & { error?: string }>(response);
      if (!response.ok) throw new Error(data?.error ?? "AI解説を取得できませんでした。");
      if (!data) throw new Error("AI解説を取得できませんでした。");
      if (typeof data.explanation !== "string") throw new Error("AI解説の形式が不正です。");

      setAiExplanations((current) => ({
        ...current,
        [question.id]: {
          explanation: data.explanation,
          fromCache: Boolean(data.fromCache),
          modelName: typeof data.modelName === "string" ? data.modelName : "Gemini",
        },
      }));
    } catch (cause) {
      setAiErrors((current) => ({
        ...current,
        [question.id]: cause instanceof Error ? cause.message : "AI解説を取得できませんでした。",
      }));
    } finally {
      setAiLoadingQuestionId((current) => (current === question.id ? null : current));
    }
  }

  async function finishPractice() {
    if (
      session &&
      session.answeredCount < session.questionCount &&
      !window.confirm(
        `未回答の問題が${session.questionCount - session.answeredCount}問あります。ここで終了すると、練習完了の5ptは獲得できません。結果を保存して終了しますか？`,
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/practice/sessions/${sessionId}/finish`, { method: "POST" });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error ?? "練習を終了できませんでした。");
      router.push(`/practice/${sessionId}/result`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "練習を終了できませんでした。");
      setSubmitting(false);
    }
  }

  function goToQuestion(index: number) {
    if (!session) return;
    setCurrentIndex(index);
    setSelectedChoice(session.questions[index].answer?.selectedChoiceId ?? "");
    setAnswerResult(null);
    setError("");
  }

  if (loading) {
    return (
      <StudentShell>
        <LoadingCard message="問題を準備しています..." />
      </StudentShell>
    );
  }

  if (error && !session) {
    return (
      <StudentShell>
        <ErrorCard message={error} />
      </StudentShell>
    );
  }

  if (!session || !question) return null;
  const displayedResult = answerResult ?? question.answer;
  const aiExplanation = aiExplanations[question.id];
  const aiError = aiErrors[question.id];
  const aiLoading = aiLoadingQuestionId === question.id;
  const answeredAllQuestions = session.answeredCount === session.questionCount;
  const nextUnansweredIndex = findNextUnansweredIndex(session.questions, currentIndex);

  return (
    <StudentShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-black tracking-[0.14em] text-blue-600">PRACTICE</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">
            {session.exam.name} 過去問練習
          </h1>
        </div>
        <div className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-200">
          {currentIndex + 1} / {session.questionCount} 問目
        </div>
      </div>

      <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-3 text-xs font-black text-blue-600">{question.category.name}</p>
        <p className="text-lg font-bold leading-8 text-slate-950">{question.text}</p>

        {question.imagePath ? (
          <div className="relative mt-5 min-h-52 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <Image
              src={question.imagePath}
              alt="問題の図"
              fill
              loading="eager"
              className="object-contain p-4"
              sizes="(max-width: 768px) 100vw, 800px"
            />
          </div>
        ) : null}

        <div className="mt-7 grid gap-3">
          {question.choices.map((choice) => {
            const chosen = selectedChoice === choice.id;
            const correct = Boolean(displayedResult?.correctChoice?.id === choice.id);
            const wrong = Boolean(displayedResult && chosen && !correct);

            return (
              <button
                key={choice.id}
                type="button"
                disabled={Boolean(displayedResult)}
                onClick={() => setSelectedChoice(choice.id)}
                className={`flex min-h-16 items-center gap-4 rounded-2xl border px-4 text-left font-bold transition sm:px-5 ${
                  correct
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : wrong
                      ? "border-rose-400 bg-rose-50 text-rose-900"
                      : chosen
                        ? "border-blue-500 bg-blue-50 text-blue-950 ring-2 ring-blue-100"
                        : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-black">
                  {choice.choiceLabel}
                </span>
                <QuestionChoiceContent text={choice.choiceText} label={choice.choiceLabel} />
                {correct ? (
                  <span className="ml-auto grid size-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-black text-white">
                    正
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {displayedResult ? (
          <div
            className={`mt-6 rounded-2xl border p-5 ${
              displayedResult.isCorrect
                ? "border-emerald-200 bg-emerald-50"
                : "border-rose-200 bg-rose-50"
            }`}
          >
            <p className={`font-black ${displayedResult.isCorrect ? "text-emerald-800" : "text-rose-800"}`}>
              {displayedResult.isCorrect ? "正解です！" : "不正解です。次の問題で取り返しましょう。"}
            </p>
            {!displayedResult.isCorrect && displayedResult.correctChoice ? (
              <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
                正解は {displayedResult.correctChoice.choiceLabel} です。
              </p>
            ) : null}
            {displayedResult.explanation ? (
              <p className="mt-2 text-sm leading-6 text-slate-700">{displayedResult.explanation}</p>
            ) : null}
          </div>
        ) : null}

        {displayedResult ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-black text-sky-900">AI解説補助</p>
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
                className="mt-4 rounded-xl bg-sky-600 px-5 py-3 text-sm font-black text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {aiLoading ? "AI解説を作成中..." : "AI解説を作成する"}
              </button>
            )}

            {aiError ? <p className="mt-3 text-sm font-bold text-rose-700">{aiError}</p> : null}
          </div>
        ) : null}

        {error ? <div className="mt-5"><ErrorCard message={error} /></div> : null}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/practice"
              className="rounded-xl border border-slate-300 px-5 py-3 text-center text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
              あとで続ける
            </Link>
            {!answeredAllQuestions ? (
              <button
                type="button"
                onClick={finishPractice}
                disabled={submitting || session.answeredCount === 0}
                className="rounded-xl px-5 py-3 text-sm font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ここで終了する
              </button>
            ) : null}
          </div>

          {!displayedResult ? (
            <button
              type="button"
              onClick={submitAnswer}
              disabled={!selectedChoice || submitting}
              className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "保存中..." : "回答する"}
            </button>
          ) : !answeredAllQuestions && nextUnansweredIndex !== -1 ? (
            <button
              type="button"
              onClick={() => goToQuestion(nextUnansweredIndex)}
              className="rounded-xl bg-slate-950 px-6 py-3 font-black text-white transition hover:bg-blue-700"
            >
              次の未回答へ
            </button>
          ) : (
            <button
              type="button"
              onClick={finishPractice}
              disabled={submitting}
              className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white transition hover:bg-emerald-700"
            >
              結果を見る
            </button>
          )}
        </div>
      </section>

      <div className="mx-auto mt-5 grid max-w-3xl grid-cols-6 gap-2 sm:grid-cols-10">
        {session.questions.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => goToQuestion(index)}
            aria-label={`${index + 1}問目へ`}
            aria-current={index === currentIndex ? "step" : undefined}
            className={`size-9 rounded-full text-sm font-black transition ${
              index === currentIndex
                ? "bg-blue-600 text-white"
                : item.answer?.isCorrect
                  ? "bg-emerald-100 text-emerald-700"
                  : item.answer
                    ? "bg-rose-100 text-rose-700"
                  : "bg-white text-slate-500 ring-1 ring-slate-200"
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </StudentShell>
  );
}

function findNextUnansweredIndex(questions: PracticeQuestion[], currentIndex: number) {
  for (let offset = 1; offset <= questions.length; offset += 1) {
    const index = (currentIndex + offset) % questions.length;
    if (!questions[index].answer) return index;
  }
  return -1;
}
