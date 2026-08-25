"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { QuestionChoiceContent } from "@/components/question-choice-content";

export type QuizQuestion = {
  id: string;
  text: string;
  imagePath: string | null;
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

export type QuizAnswerResult = {
  isCorrect: boolean;
  explanation: string | null;
  correctChoice: {
    id: string;
    label: string;
    text: string;
  };
};

type QuizQuestionCardProps = {
  title: string;
  description: string;
  question: QuizQuestion | null;
  selectedChoiceId: string | null;
  answerResult: QuizAnswerResult | null;
  loading: boolean;
  answering: boolean;
  error: string;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  headerAction?: ReactNode;
  resultNotice?: ReactNode;
  resultExtra?: ReactNode;
  resultActions?: ReactNode;
};

export function QuizQuestionCard({
  title,
  description,
  question,
  selectedChoiceId,
  answerResult,
  loading,
  answering,
  error,
  onSelectChoice,
  onSubmit,
  headerAction,
  resultNotice,
  resultExtra,
  resultActions,
}: QuizQuestionCardProps) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-black text-slate-950">{title}</h1>
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
        {headerAction}
      </div>

      <p className="mt-3 text-xs font-bold leading-5 text-slate-500">{description}</p>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          role="status"
          className="mt-7 rounded-md border border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-500"
        >
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
                loading="eager"
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
                  aria-pressed={chosen}
                  disabled={Boolean(answerResult) || answering}
                  onClick={() => onSelectChoice(choice.id)}
                  className={`flex min-h-12 w-full items-center gap-3 px-2 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
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
                  <span className="shrink-0 text-xs font-black text-slate-500">
                    {choice.label}
                  </span>
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
                onClick={onSubmit}
                className="inline-flex h-11 min-w-36 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {answering ? "判定中..." : "回答する"}
              </button>
            </div>
          ) : (
            <div className="mt-7 border-t border-slate-200 pt-6">
              <div className="flex gap-4" role="status" aria-live="polite">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full text-2xl font-black text-white ${
                    answerResult.isCorrect ? "bg-emerald-600" : "bg-rose-600"
                  }`}
                >
                  {answerResult.isCorrect ? "✓" : "!"}
                </span>
                <div>
                  <p
                    className={`text-lg font-black ${
                      answerResult.isCorrect ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {answerResult.isCorrect ? "正解！" : "不正解"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                    正解は {answerResult.correctChoice.label} です。
                  </p>
                </div>
              </div>

              {resultNotice}

              <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-emerald-700">
                  <span className="grid size-6 place-items-center rounded-full bg-emerald-600 text-white">
                    !
                  </span>
                  解説
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {answerResult.explanation ?? "この問題の解説はまだ登録されていません。"}
                </p>
              </div>

              {resultExtra}
              {resultActions ? (
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  {resultActions}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-7 rounded-md border border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-500">
          表示できる問題がありません。
        </div>
      )}
    </section>
  );
}
