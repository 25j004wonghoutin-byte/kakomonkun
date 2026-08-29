import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { getCurrentUser } from "@/lib/auth";
import {
  getStudentLearningData,
  type LearningFilters,
  type LearningPeriod,
  type ProfileLearningData,
} from "@/lib/profile-learning-data";
import { LearningFilters as LearningFilterControls } from "./learning-filters";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ProfileLearningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role.name !== "student" || !user.studentProfile) redirect("/");

  const filters = parseFilters(await searchParams);
  const data = await getStudentLearningData(user.id, filters);
  if (filters.page > data.pagination.totalPages) {
    redirect(buildPageHref(filters, data.pagination.totalPages));
  }

  return (
    <StudentShell userName={user.displayName} points={user.studentProfile.totalPoints}>
      <div className="mx-auto w-full max-w-[1120px] min-w-0">
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-black text-slate-500">
            <Link href="/profile" className="min-h-11 content-center text-blue-700 hover:text-blue-900">
              マイページ
            </Link>
            <span aria-hidden="true">›</span>
            <span>学習状況詳細</span>
          </div>
          <p className="mb-1 text-xs font-black text-blue-600">LEARNING ANALYTICS</p>
          <h1 className="text-3xl font-black text-slate-950">学習状況詳細</h1>
        </div>

        <div className="space-y-4">
          <LearningFilterControls
            period={data.filters.period}
            examId={data.filters.examId}
            exams={data.exams}
          />

          <SummaryStrip data={data} />

          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.85fr)]">
            <TrendPanel data={data} />
            <BreakdownPanel data={data} />
          </div>

          <HistoryPanel data={data} />
        </div>
      </div>
    </StudentShell>
  );
}

function SummaryStrip({ data }: { data: ProfileLearningData }) {
  const trend = getAccuracyTrend(data);
  const cells = [
    {
      label: "回答数",
      value: `${data.stats.answerCount.toLocaleString()} 問`,
      note: getPeriodLabel(data.filters.period),
    },
    {
      label: "正解数",
      value: `${data.stats.correctCount.toLocaleString()} 問`,
      note: `不正解 ${(data.stats.answerCount - data.stats.correctCount).toLocaleString()}問`,
    },
    {
      label: "正答率",
      value: `${data.stats.accuracy}%`,
      note: data.filters.period === "month" ? trend : "選択期間の結果",
    },
    {
      label: "練習完了",
      value: `${data.stats.practiceCount.toLocaleString()} 回`,
      note: "選択期間の記録",
    },
  ];

  return (
    <section
      aria-label="学習サマリー"
      className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white lg:grid-cols-4"
    >
      {cells.map((cell, index) => (
        <article
          key={cell.label}
          className={`min-h-24 border-slate-200 px-4 py-4 ${
            index < 2 ? "border-b" : ""
          } ${index % 2 === 0 ? "border-r" : ""} lg:border-b-0 ${
            index < 3 ? "lg:border-r" : "lg:border-r-0"
          }`}
        >
          <span className="block text-[11px] font-bold text-slate-500">{cell.label}</span>
          <strong className="mt-1 block text-xl font-black text-slate-950 sm:text-2xl">
            {cell.value}
          </strong>
          <span className="mt-1 block text-[10px] font-bold text-slate-500">{cell.note}</span>
        </article>
      ))}
    </section>
  );
}

function TrendPanel({ data }: { data: ProfileLearningData }) {
  const hasAnswers = data.stats.answerCount > 0;
  return (
    <section
      aria-labelledby="accuracy-trend-heading"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex min-h-[62px] items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 id="accuracy-trend-heading" className="text-base font-black text-slate-950">
          正答率の推移
        </h2>
        {hasAnswers ? (
          <span className="text-xs font-black text-emerald-700">{getAccuracyTrend(data)}</span>
        ) : null}
      </div>
      <div className="p-5">
        {hasAnswers && data.trend.length > 0 ? (
          <AccuracyTrendChart points={data.trend} />
        ) : (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <strong className="block text-sm font-black text-slate-800">表示できる学習記録がありません</strong>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                過去問練習を完了すると正答率の推移が表示されます。
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AccuracyTrendChart({ points }: { points: ProfileLearningData["trend"] }) {
  const width = 680;
  const height = 240;
  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const pointCoordinates = points.map((point, index) => ({
    ...point,
    x: left + (points.length === 1 ? plotWidth / 2 : (plotWidth * index) / (points.length - 1)),
    y: top + plotHeight - (plotHeight * point.accuracy) / 100,
  }));
  const plottedPoints = pointCoordinates.filter((point) => point.answerCount > 0);
  const path = plottedPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-bold text-slate-500">
        <span>{points[0]?.label.includes("週") ? "週ごとの正答率" : "月ごとの正答率"}</span>
        <span>目標 70%</span>
      </div>
      <svg
        role="img"
        aria-label={`正答率の推移。${points.map((point) => point.answerCount > 0 ? `${point.label} ${point.accuracy}%` : `${point.label} 記録なし`).join("、")}`}
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
      >
        {[0, 25, 50, 75, 100].map((value) => {
          const y = top + plotHeight - (plotHeight * value) / 100;
          return (
            <g key={value}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={left - 9} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">
                {value}%
              </text>
            </g>
          );
        })}
        <line
          x1={left}
          x2={width - right}
          y1={top + plotHeight - plotHeight * 0.7}
          y2={top + plotHeight - plotHeight * 0.7}
          stroke="#16a34a"
          strokeDasharray="5 5"
          strokeWidth="1.5"
        />
        {plottedPoints.length > 1 ? (
          <path d={path} fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        ) : null}
        {pointCoordinates.map((point) => (
          <text key={point.key} x={point.x} y={height - 14} textAnchor="middle" fill="#475569" fontSize="11" fontWeight="700">
            {point.label}
          </text>
        ))}
        {plottedPoints.map((point) => (
          <circle key={point.key} cx={point.x} cy={point.y} r="5" fill="#fff" stroke="#2563eb" strokeWidth="3" />
        ))}
      </svg>
    </div>
  );
}

function BreakdownPanel({ data }: { data: ProfileLearningData }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="min-h-[62px] border-b border-slate-200 px-5 py-5">
        <h2 className="text-base font-black text-slate-950">試験・分野別</h2>
      </div>
      <div className="divide-y divide-slate-200">
        <div className="space-y-4 p-5">
          {data.examStats.map((exam) => (
            <div key={exam.id}>
              <div className="flex items-center justify-between gap-3">
                <strong className="truncate text-xs font-black text-slate-800" title={exam.name}>
                  {shortExamName(exam.name)}
                </strong>
                <span className="text-lg font-black text-slate-950">{exam.accuracy}%</span>
              </div>
              <div className="mt-1 flex justify-between gap-3 text-[10px] font-bold text-slate-500">
                <span>{exam.correctCount.toLocaleString()} / {exam.answerCount.toLocaleString()}問</span>
                <span>{exam.practiceCount.toLocaleString()}回練習</span>
              </div>
            </div>
          ))}
          {data.examStats.length === 0 ? (
            <p className="text-xs font-semibold text-slate-500">対象の試験記録はありません。</p>
          ) : null}
        </div>
        <div className="space-y-4 p-5">
          {data.categoryStats.map((category) => (
            <div key={category.code}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-black text-slate-700">
                <span>{category.name.replace(/系$/, "")}</span>
                <span>{category.accuracy}%</span>
              </div>
              <div
                role="img"
                aria-label={`${category.name} ${category.answerCount}問中、正答率${category.accuracy}%`}
                className="h-2 overflow-hidden rounded-full bg-slate-200"
              >
                <span className="block h-full rounded-full bg-blue-600" style={{ width: `${category.accuracy}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HistoryPanel({ data }: { data: ProfileLearningData }) {
  const { pagination } = data;
  const start = pagination.totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

  return (
    <section
      aria-labelledby="practice-history-heading"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex min-h-[62px] items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 id="practice-history-heading" className="text-base font-black text-slate-950">
          過去問練習履歴
        </h2>
        <span className="text-xs font-bold text-slate-500">全{pagination.totalCount.toLocaleString()}件</span>
      </div>

      {data.history.length > 0 ? (
        <>
          <table className="hidden w-full table-fixed border-collapse md:table">
            <thead className="bg-slate-50 text-left text-[10px] font-black text-slate-500">
              <tr>
                <th className="w-[18%] px-5 py-3">日時</th>
                <th className="w-[24%] px-5 py-3">試験</th>
                <th className="w-[18%] px-5 py-3">分類</th>
                <th className="w-[14%] px-5 py-3">結果</th>
                <th className="w-[12%] px-5 py-3">ポイント</th>
                <th className="w-[14%] px-5 py-3"><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.history.map((session) => (
                <tr key={session.id} className="text-xs font-bold text-slate-700">
                  <td className="px-5 py-4">{dateFormatter.format(new Date(session.completedAt))}</td>
                  <td className="truncate px-5 py-4" title={session.examName}>{shortExamName(session.examName)}</td>
                  <td className="px-5 py-4">{session.categoryName}</td>
                  <td className="px-5 py-4 font-black text-slate-950">{session.correctCount} / {session.answeredCount}</td>
                  <td className="px-5 py-4">{formatPoints(session.earnedPoints)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/practice/${session.id}/result`} className="inline-flex min-h-11 items-center text-blue-700 hover:text-blue-900">
                      結果を見る
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-slate-100 md:hidden">
            {data.history.map((session) => (
              <li key={session.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block break-words text-sm font-black text-slate-900">{shortExamName(session.examName)}</strong>
                    <span className="mt-1 block text-[10px] font-bold text-slate-500">{dateFormatter.format(new Date(session.completedAt))} ・ {session.categoryName}</span>
                  </div>
                  <strong className="shrink-0 text-sm font-black text-slate-950">{session.correctCount} / {session.answeredCount}</strong>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-black text-emerald-700">{formatPoints(session.earnedPoints)}</span>
                  <Link href={`/practice/${session.id}/result`} className="inline-flex min-h-11 items-center text-xs font-black text-blue-700">
                    結果を見る
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="px-5 py-12 text-center text-sm font-bold text-slate-500">
          条件に一致する練習履歴はありません。
        </p>
      )}

      <div className="flex min-h-[62px] items-center justify-between gap-4 border-t border-slate-200 px-5 py-3">
        <span className="text-xs font-bold text-slate-500">{start}–{end} / {pagination.totalCount}件</span>
        <div className="flex items-center gap-2">
          <PaginationLink
            href={buildPageHref(data.filters, pagination.page - 1)}
            disabled={pagination.page <= 1}
            label="前のページ"
          >
            ‹
          </PaginationLink>
          <PaginationLink
            href={buildPageHref(data.filters, pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            label="次のページ"
          >
            ›
          </PaginationLink>
        </div>
      </div>
    </section>
  );
}

function PaginationLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: string;
}) {
  const className = `grid size-11 place-items-center rounded-md border text-xl font-black ${
    disabled
      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
      : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
  }`;
  return disabled ? (
    <span aria-label={label} aria-disabled="true" className={className}>{children}</span>
  ) : (
    <Link aria-label={label} href={href} className={className}>{children}</Link>
  );
}

function parseFilters(params: Record<string, string | string[] | undefined>): LearningFilters {
  const periodValue = firstValue(params.period);
  const examValue = firstValue(params.exam);
  const pageValue = Number(firstValue(params.page));
  return {
    period: isLearningPeriod(periodValue) ? periodValue : "month",
    examId: examValue && isUuid(examValue) ? examValue : null,
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10_000) : 1,
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isLearningPeriod(value: string | undefined): value is LearningPeriod {
  return value === "month" || value === "three-months" || value === "all";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildPageHref(filters: LearningFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.period !== "month") params.set("period", filters.period);
  if (filters.examId) params.set("exam", filters.examId);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/profile/learning?${query}` : "/profile/learning";
}

function getPeriodLabel(period: LearningPeriod) {
  if (period === "month") return "今月の記録";
  if (period === "three-months") return "過去3か月の記録";
  return "全期間の記録";
}

function getAccuracyTrend(data: ProfileLearningData) {
  if (data.stats.answerCount === 0) return "記録なし";
  if (data.filters.period !== "month" || data.stats.previousMonthAccuracy === null) {
    return `${data.stats.accuracy}%`;
  }
  const difference = data.stats.accuracy - data.stats.previousMonthAccuracy;
  return `前月比 ${difference > 0 ? "+" : ""}${difference}%`;
}

function shortExamName(name: string) {
  return name.replace(/技術者試験$/, "").replace(/試験$/, "");
}

function formatPoints(points: number) {
  return `${points > 0 ? "+" : ""}${points.toLocaleString()} pt`;
}
