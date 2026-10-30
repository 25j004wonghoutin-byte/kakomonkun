"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRememberedPracticePreferences, type PracticePreferences } from "@/components/study-ui-preferences";
import { StudentShell } from "@/components/student-shell";
import type { StudentIdentity } from "@/lib/me";
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
import { waitForPracticeSaves } from "@/lib/pending-practice-saves";
import { formatTokyoDateTime } from "@/lib/tokyo-date";
import { readJsonResponse } from "@/lib/read-json-response";

const exams = [
  {
    code: "it_passport",
    shortName: "ITパスポート",
  },
  {
    code: "fe",
    shortName: "基本情報技術者（科目A）",
  },
] as const;

const categoryOptions: Array<{
  code: PracticeCategoryCode;
  label: string;
}> = [
  {
    code: ALL_PRACTICE_CATEGORY_CODE,
    label: "全分野（均等）",
  },
  ...PRACTICE_CATEGORIES,
];



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
  const [selectedExam, setSelectedExam] = useState<PracticePreferences["examCode"]>("it_passport");
  const [selectedCategory, setSelectedCategory] = useState<PracticeCategoryCode>(
    ALL_PRACTICE_CATEGORY_CODE,
  );
  const [selectedQuestionCount, setSelectedQuestionCount] = useState<PracticeQuestionCount>(30);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [points, setPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState("");
  const [error, setError] = useState("");
  const [identityLoading, setIdentityLoading] = useState(true);
  const { getPracticePreferences, rememberPracticePreferences } = useRememberedPracticePreferences();

  function changePreferences(patch: Partial<PracticePreferences>) {
    if (identityLoading) return;
    const next = { examCode: selectedExam, categoryCode: selectedCategory, questionCount: selectedQuestionCount, ...patch };
    setSelectedExam(next.examCode);
    setSelectedCategory(next.categoryCode);
    setSelectedQuestionCount(next.questionCount);
    if (identity) rememberPracticePreferences(identity.id, next);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      const identityRequest = fetch("/api/me")
        .then(response => response.ok ? response.json() : null)
        .then(meData => {
          if (cancelled || !meData) return;
          setIdentity({ id: meData.id, displayName: meData.displayName, avatarUrl: meData.profile?.avatarUrl ?? null });
          setPoints(meData.profile?.totalPoints ?? 0);
          const remembered = getPracticePreferences(meData.id);
          if (remembered) {
            setSelectedExam(remembered.examCode);
            setSelectedCategory(remembered.categoryCode);
            setSelectedQuestionCount(remembered.questionCount);
          }
        })
        .finally(() => { if (!cancelled) setIdentityLoading(false); });

      const sessionsRequest = waitForPracticeSaves()
        .then(() => cancelled ? null : fetch("/api/practice/sessions", { cache: "no-store" }))
        .then(response => response?.ok ? response.json() : null)
        .then(data => {
          if (!cancelled && Array.isArray(data?.sessions)) setActiveSessions(data.sessions);
        });

      await Promise.allSettled([identityRequest, sessionsRequest]);
    }

    void loadPageData();
    return () => { cancelled = true; };
  }, [getPracticePreferences]);

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
    <StudentShell identity={identity} points={points}>
      <PageHeading title="過去問練習" />

      {activeSessions.length > 0 ? (
        <section className="mb-8" aria-labelledby="active-practice-heading">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 id="active-practice-heading" className="text-lg font-black text-slate-950">
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
                  className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4  sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 w-full items-center gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">
                      {progress}%
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-black text-slate-950">{session.exam.name}</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {session.answeredCount} / {session.questionCount} 問回答 ・{" "}
                        {formatTokyoDateTime(session.startedAt)}
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

      <div className="practice-exams" role="group" aria-label="試験を選択" aria-busy={identityLoading}>
        {exams.map((exam) => {
          const selected = selectedExam === exam.code;
          return (
            <button
              key={exam.code}
              type="button"
              aria-pressed={selected}
              aria-label={exam.shortName}
              disabled={identityLoading || submitting}
              onClick={() => changePreferences({ examCode: exam.code })}
              className="practice-exam disabled:cursor-wait disabled:opacity-50"
            >
              <span className="practice-exam-label">
                <span>{exam.code === "fe" ? "基本情報技術者" : exam.shortName}</span>
                {exam.code === "fe" ? <small>科目A</small> : null}
              </span>
              <span className="practice-radio" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="practice-options">
        <div
          className="practice-config-grid"
        >
          {categorySelectionEnabled ? (
            <fieldset>
              <legend className="text-lg font-black text-slate-950">出題分野</legend>
              <div className="practice-category-grid">
                {categoryOptions.map((category) => {
                  const selected = selectedCategory === category.code;
                  return (
                    <button
                      key={category.code}
                      type="button"
                      aria-pressed={selected}
                      disabled={identityLoading || submitting}
                      onClick={() => changePreferences({ categoryCode: category.code })}
                      className="practice-choice disabled:cursor-wait disabled:opacity-50"
                    >
                      <span className="block font-black">{category.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <fieldset>
            <legend className="text-lg font-black text-slate-950">問題数</legend>
            <div
              className="practice-count-grid"
            >
              {PRACTICE_QUESTION_COUNTS.map((count) => {
                const selected = selectedQuestionCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={selected}
                    disabled={identityLoading || submitting}
                    onClick={() => changePreferences({ questionCount: count })}
                    className="practice-choice practice-count disabled:cursor-wait disabled:opacity-50"
                  >
                    {count}問
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="practice-summary">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-lg font-black text-slate-950">
                {selectedExamData.shortName} ・{" "}
                {categorySelectionEnabled ? `${selectedCategoryData.label} ・ ` : ""}
                {selectedQuestionCount}問
              </p>
              {categorySelectionEnabled && selectedCategory === ALL_PRACTICE_CATEGORY_CODE ? (
                <p className="mt-1 text-sm text-slate-500">3分野から各{questionsPerCategory}問</p>
              ) : null}
              <p className="mt-2 text-xs leading-6 text-slate-500">
                全問回答で{getPracticeCompletionPoints(selectedQuestionCount)}pt（1日2回まで）＋10問正解ごとに1ptボーナス。
              </p>
            </div>
            <button
              type="button"
              onClick={startPractice}
              disabled={submitting || identityLoading}
              className="app-primary w-full sm:w-auto sm:min-w-44"
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
