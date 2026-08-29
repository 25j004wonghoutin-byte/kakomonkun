"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StudentShell } from "@/components/student-shell";
import { ErrorCard, PageHeading } from "@/components/ui";
import {
  ALL_PRACTICE_CATEGORY_CODE,
  getPracticeCompletionPoints,
  PRACTICE_CATEGORIES,
  PRACTICE_QUESTION_COUNTS,
  supportsPracticeCategorySelection,
  type PracticeCategoryCode,
  type PracticeQuestionCount,
} from "@/lib/practice-config";
import { readJsonResponse } from "@/lib/read-json-response";

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

const categoryOptions: Array<{
  code: PracticeCategoryCode;
  label: string;
  description: string;
}> = [
  {
    code: ALL_PRACTICE_CATEGORY_CODE,
    label: "指定なし",
    description: "3分野から同じ問題数ずつ出題",
  },
  ...PRACTICE_CATEGORIES.map((category) => ({
    ...category,
    description: `${category.label}系の問題だけを出題`,
  })),
];

const startedAtFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type ActiveSession = {
  id: string;
  questionCount: number;
  answeredCount: number;
  startedAt: string;
  exam: {
    code: string;
    name: string;
  };
};

type SessionStartError = {
  error?: string;
  details?: {
    shortages?: Array<{
      categoryName: string;
      available: number;
      required: number;
    }>;
  };
};

export default function PracticeStartPage() {
  const router = useRouter();
  const [selectedExam, setSelectedExam] = useState("it_passport");
  const [selectedCategory, setSelectedCategory] = useState<PracticeCategoryCode>(
    ALL_PRACTICE_CATEGORY_CODE,
  );
  const [selectedQuestionCount, setSelectedQuestionCount] = useState<PracticeQuestionCount>(30);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [userName, setUserName] = useState<string | undefined>();
  const [points, setPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      const [meResponse, sessionsResponse] = await Promise.all([
        fetch("/api/me"),
        fetch("/api/practice/sessions"),
      ]);
      const [meData, sessionsData] = await Promise.all([
        meResponse.ok ? meResponse.json() : null,
        sessionsResponse.ok ? sessionsResponse.json() : null,
      ]);

      if (cancelled) return;
      if (meData) {
        setUserName(meData.displayName);
        setPoints(meData.profile?.totalPoints ?? 0);
      }
      if (Array.isArray(sessionsData?.sessions)) {
        setActiveSessions(sessionsData.sessions);
      }
    }

    loadPageData().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function startPractice() {
    setSubmitting(true);
    setError("");

    try {
      const categorySelectionEnabled = supportsPracticeCategorySelection(selectedExam);
      const response = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examCode: selectedExam,
          ...(categorySelectionEnabled ? { categoryCode: selectedCategory } : {}),
          questionCount: selectedQuestionCount,
        }),
      });
      const data = await readJsonResponse<SessionStartError & { sessionId?: string }>(response);
      if (!response.ok || !data?.sessionId) {
        throw new Error(formatSessionStartError(data ?? {}));
      }
      router.push(`/practice/${data.sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "練習を開始できませんでした。");
      setSubmitting(false);
    }
  }

  async function endPractice(session: ActiveSession) {
    const completionPoints = getPracticeCompletionPoints(session.questionCount);
    const answeredAllQuestions = session.answeredCount === session.questionCount;
    const confirmed = window.confirm(
      answeredAllQuestions
        ? "練習を終了して結果を表示しますか？"
        : `この練習を終了しますか？未回答の問題は回答できなくなり、練習完了の${completionPoints}ptは獲得できません。`,
    );
    if (!confirmed) return;

    setEndingSessionId(session.id);
    setSessionActionError("");

    try {
      const response = await fetch(`/api/practice/sessions/${session.id}/finish`, {
        method: "POST",
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error ?? "練習を終了できませんでした。");
      router.push(`/practice/${session.id}/result`);
    } catch (cause) {
      setSessionActionError(
        cause instanceof Error ? cause.message : "練習を終了できませんでした。",
      );
      setEndingSessionId(null);
    }
  }

  const selectedExamData = exams.find((exam) => exam.code === selectedExam) ?? exams[0];
  const categorySelectionEnabled = supportsPracticeCategorySelection(selectedExam);
  const selectedCategoryData =
    categoryOptions.find((category) => category.code === selectedCategory) ?? categoryOptions[0];
  const questionsPerCategory = selectedQuestionCount / PRACTICE_CATEGORIES.length;

  return (
    <StudentShell userName={userName} points={points}>
      <PageHeading
        eyebrow="PAST QUESTIONS"
        title="過去問練習"
        description="試験と問題数を選んで、自分に合った練習を始めましょう。"
      />

      {activeSessions.length > 0 ? (
        <section className="mb-8" aria-labelledby="active-practice-heading">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black text-blue-600">CONTINUE</p>
              <h2 id="active-practice-heading" className="mt-1 text-lg font-black text-slate-950">
                途中の練習
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-500">回答は自動保存されています</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {activeSessions.map((session) => {
              const progress = Math.round((session.answeredCount / session.questionCount) * 100);
              const ending = endingSessionId === session.id;
              return (
                <article
                  key={session.id}
                  className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 w-full items-center gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">
                      {progress}%
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-black text-slate-950">{session.exam.name}</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {session.answeredCount} / {session.questionCount} 問回答 ・{" "}
                        {startedAtFormatter.format(new Date(session.startedAt))}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => endPractice(session)}
                      disabled={endingSessionId !== null}
                      className="min-h-11 flex-1 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50 sm:flex-none"
                    >
                      {ending ? "終了中..." : "終了する"}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/practice/${session.id}`)}
                      disabled={endingSessionId !== null}
                      className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-400 sm:flex-none"
                    >
                      続きから
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {sessionActionError ? (
            <div className="mt-4">
              <ErrorCard message={sessionActionError} />
            </div>
          ) : null}
        </section>
      ) : null}

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
                    <h2 className="text-2xl font-black text-slate-950">{exam.shortName}</h2>
                  </div>
                  <span
                    className={`grid size-7 place-items-center rounded-full border-2 ${
                      selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"
                    }`}
                    aria-hidden="true"
                  >
                    {selected ? <span className="size-2 rounded-full bg-white" /> : null}
                  </span>
                </div>
                <p className="mt-4 leading-7 text-slate-600">{exam.description}</p>
                <div className="mt-6 flex gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    30 / 60問
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
        <div
          className={`grid gap-8 ${
            categorySelectionEnabled
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.4fr)]"
              : "max-w-md"
          }`}
        >
          {categorySelectionEnabled ? (
            <fieldset>
              <legend className="text-lg font-black text-slate-950">出題分野</legend>
              <p className="mt-1 text-sm font-medium text-slate-500">
                指定なしでは3分野から均等に出題します。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {categoryOptions.map((category) => {
                  const selected = selectedCategory === category.code;
                  return (
                    <button
                      key={category.code}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedCategory(category.code)}
                      className={`min-h-20 rounded-xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-950 ring-2 ring-blue-100"
                          : "border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-black">{category.label}</span>
                      <span className="mt-1 block text-xs font-bold text-slate-500">
                        {category.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <fieldset>
            <legend className="text-lg font-black text-slate-950">問題数</legend>
            <p className="mt-1 text-sm font-medium text-slate-500">1回の練習で解く問題数です。</p>
            <div
              className={`mt-4 grid grid-cols-2 gap-3 ${
                categorySelectionEnabled ? "lg:grid-cols-1" : ""
              }`}
            >
              {PRACTICE_QUESTION_COUNTS.map((count) => {
                const selected = selectedQuestionCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedQuestionCount(count)}
                    className={`min-h-16 rounded-xl border px-4 text-center text-xl font-black transition ${
                      selected
                        ? "border-blue-500 bg-blue-600 text-white ring-2 ring-blue-100"
                        : "border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-slate-50"
                    }`}
                  >
                    {count}問
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="mt-8 border-y border-slate-200 py-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-500">選択中のコース</p>
              <p className="mt-1 text-lg font-black text-slate-950">
                {selectedExamData.shortName} ・{" "}
                {categorySelectionEnabled ? `${selectedCategoryData.label} ・ ` : ""}
                {selectedQuestionCount}問
              </p>
              <p className="mt-1 text-sm font-medium text-slate-600">
                {!categorySelectionEnabled
                  ? `全分野から${selectedQuestionCount}問をランダムに出題します。`
                  : selectedCategory === ALL_PRACTICE_CATEGORY_CODE
                    ? `テクノロジ・マネジメント・ストラテジから各${questionsPerCategory}問出題します。`
                    : `${selectedCategoryData.label}系から${selectedQuestionCount}問出題します。`}
              </p>
              <p className="mt-1 text-sm font-bold text-blue-700">
                全問回答で{getPracticeCompletionPoints(selectedQuestionCount)}pt（1日2回まで）＋10問正解ごとに1ptボーナス。
              </p>
            </div>
            <button
              type="button"
              onClick={startPractice}
              disabled={submitting}
              className="min-h-12 w-full shrink-0 rounded-xl bg-blue-600 px-6 py-3 text-base font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-400 sm:w-auto sm:min-w-48"
            >
              {submitting ? "準備しています..." : "練習を開始する"}
            </button>
          </div>

          {error ? (
            <div className="mt-5">
              <ErrorCard message={error} />
            </div>
          ) : null}
        </div>
      </div>
    </StudentShell>
  );
}

function formatSessionStartError(data: SessionStartError) {
  const shortages = data.details?.shortages;
  if (shortages?.length) {
    const detail = shortages
      .map(
        (shortage) =>
          `${shortage.categoryName}（${shortage.available}問 / 必要${shortage.required}問）`,
      )
      .join("、");
    return `問題数が不足しています。${detail}`;
  }

  return data.error ?? "練習を開始できませんでした。";
}
