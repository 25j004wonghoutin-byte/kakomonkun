import Link from "next/link";
import type {
  DailyHistoryItem,
  PracticeHistoryItem,
  TeacherStudentDetail,
  TeacherStudentDetailTab,
} from "@/lib/teacher/student-detail";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function StudentLearningDetail({ data }: { data: TeacherStudentDetail }) {
  const start =
    data.pagination.total === 0
      ? 0
      : (data.pagination.page - 1) * data.pagination.pageSize + 1;
  const end = Math.min(
    data.pagination.page * data.pagination.pageSize,
    data.pagination.total,
  );

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <Link
        href="/teacher/students"
        className="inline-flex min-h-11 items-center text-xs font-black text-blue-700 hover:text-blue-900"
      >
        ← 学生一覧へ戻る
      </Link>

      <section className="mt-2 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-blue-100 text-xl font-black text-blue-700">
            {data.student.displayName.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black tracking-[0.16em] text-blue-600">
              STUDENT LEARNING DETAIL
            </p>
            <h1 className="mt-1 break-words text-2xl font-black text-[#071d36] sm:text-3xl">
              {data.student.displayName}
            </h1>
            <p className="mt-2 text-xs font-bold text-slate-500">
              最終学習 {formatLatestLearning(data.student.latestLearningAt)}
            </p>
          </div>
        </div>
        {data.student.bio ? (
          <p className="mt-5 whitespace-pre-wrap text-sm font-medium leading-7 text-slate-600">
            {data.student.bio}
          </p>
        ) : (
          <p className="mt-5 text-sm font-medium text-slate-400">
            自己紹介は登録されていません。
          </p>
        )}
      </section>

      <section
        aria-label="学生の学習集計"
        className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-4"
      >
        <SummaryCard label="総回答数" value={data.summary.answerCount} unit="問" />
        <SummaryCard label="正解数" value={data.summary.correctCount} unit="問" />
        <SummaryCard label="正答率" value={data.summary.accuracy} unit="%" />
        <SummaryCard label="ポイント" value={data.student.totalPoints} unit="pt" />
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <nav aria-label="学習履歴の種類" className="grid grid-cols-2 border-b border-slate-200">
          <TabLink
            href={buildDetailHref(data.student.id, "practice", 1)}
            active={data.tab === "practice"}
          >
            過去問練習
          </TabLink>
          <TabLink
            href={buildDetailHref(data.student.id, "daily", 1)}
            active={data.tab === "daily"}
          >
            一日一問
          </TabLink>
        </nav>

        <div className="flex min-h-[62px] items-center justify-between gap-4 border-b border-slate-200 px-5 py-3 sm:px-6">
          <h2 className="text-base font-black text-slate-950">
            {data.tab === "practice" ? "過去問練習の履歴" : "一日一問の履歴"}
          </h2>
          <span className="text-xs font-bold text-slate-500">新しい順</span>
        </div>

        {data.tab === "practice" ? (
          <PracticeHistory items={data.practiceHistory} />
        ) : (
          <DailyHistory items={data.dailyHistory} />
        )}

        <div className="flex min-h-[68px] items-center justify-between gap-4 border-t border-slate-200 px-5 py-3 sm:px-6">
          <span className="text-xs font-bold text-slate-500">
            {start}–{end} / {data.pagination.total}件
          </span>
          <div className="flex items-center gap-2">
            <PaginationLink
              href={buildDetailHref(
                data.student.id,
                data.tab,
                data.pagination.page - 1,
              )}
              disabled={data.pagination.page <= 1}
              label="前のページ"
            >
              ‹
            </PaginationLink>
            <PaginationLink
              href={buildDetailHref(
                data.student.id,
                data.tab,
                data.pagination.page + 1,
              )}
              disabled={data.pagination.page >= data.pagination.totalPages}
              label="次のページ"
            >
              ›
            </PaginationLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <article className="min-h-28 border-b border-r border-slate-200 px-5 py-5 last:border-r-0 even:border-r-0 lg:border-b-0 lg:even:border-r lg:last:border-r-0">
      <span className="block text-xs font-bold text-slate-500">{label}</span>
      <strong className="mt-2 block text-2xl font-black text-[#071d36]">
        {value.toLocaleString()}
        <span className="ml-1 text-xs font-black text-blue-600">{unit}</span>
      </strong>
    </article>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex min-h-14 items-center justify-center px-4 text-sm font-black transition ${
        active
          ? "text-blue-700 after:absolute after:inset-x-[25%] after:bottom-0 after:h-0.5 after:rounded-full after:bg-blue-600"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      }`}
    >
      {children}
    </Link>
  );
}

function PracticeHistory({ items }: { items: PracticeHistoryItem[] }) {
  if (items.length === 0) return <EmptyHistory />;

  return (
    <>
      <table className="hidden w-full table-fixed border-collapse md:table">
        <thead className="bg-slate-50 text-left text-[11px] font-black text-slate-500">
          <tr>
            <th className="w-[22%] px-5 py-3 sm:px-6">完了日時</th>
            <th className="w-[24%] px-5 py-3">試験</th>
            <th className="w-[13%] px-5 py-3 text-right">問題数</th>
            <th className="w-[13%] px-5 py-3 text-right">正解数</th>
            <th className="w-[13%] px-5 py-3 text-right">正答率</th>
            <th className="w-[15%] px-5 py-3 text-right">獲得ポイント</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="text-xs font-bold text-slate-700">
              <td className="px-5 py-4 sm:px-6">
                {dateTimeFormatter.format(new Date(item.completedAt))}
              </td>
              <td className="break-words px-5 py-4 text-slate-950">{item.examName}</td>
              <td className="px-5 py-4 text-right">{item.questionCount}問</td>
              <td className="px-5 py-4 text-right">{item.correctCount}問</td>
              <td className="px-5 py-4 text-right font-black text-emerald-700">
                {item.accuracy}%
              </td>
              <td className="px-5 py-4 text-right text-blue-700">
                {formatPoints(item.earnedPoints)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <strong className="block break-words text-sm font-black text-slate-950">
                  {item.examName}
                </strong>
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  {dateTimeFormatter.format(new Date(item.completedAt))}
                </span>
              </div>
              <strong className="shrink-0 text-sm font-black text-emerald-700">
                {item.accuracy}%
              </strong>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-700">
              <span>{item.questionCount}問</span>
              <span>{item.correctCount}問正解</span>
              <span className="text-blue-700">{formatPoints(item.earnedPoints)}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function DailyHistory({ items }: { items: DailyHistoryItem[] }) {
  if (items.length === 0) return <EmptyHistory />;

  return (
    <>
      <table className="hidden w-full table-fixed border-collapse lg:table">
        <thead className="bg-slate-50 text-left text-[11px] font-black text-slate-500">
          <tr>
            <th className="w-[16%] px-5 py-3 sm:px-6">回答日</th>
            <th className="w-[44%] px-5 py-3">問題</th>
            <th className="w-[27%] px-5 py-3">選択肢</th>
            <th className="w-[13%] px-5 py-3 text-right">結果</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="align-top text-xs font-bold text-slate-700">
              <td className="px-5 py-4 sm:px-6">
                {dateFormatter.format(new Date(item.answerDate))}
              </td>
              <td className="px-5 py-4">
                <span className="block text-[10px] font-black text-blue-700">
                  {formatQuestionSource(item)}
                </span>
                <span className="mt-1.5 block break-words leading-6 text-slate-950">
                  {item.questionText}
                </span>
              </td>
              <td className="break-words px-5 py-4 leading-6">
                <strong className="mr-2 text-slate-950">{item.selectedChoiceLabel}</strong>
                {item.selectedChoiceText}
              </td>
              <td className="px-5 py-4 text-right">
                <ResultBadge correct={item.isCorrect} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 lg:hidden">
        {items.map((item) => (
          <li key={item.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="block text-[10px] font-black text-blue-700">
                  {formatQuestionSource(item)}
                </span>
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  {dateFormatter.format(new Date(item.answerDate))}
                </span>
              </div>
              <ResultBadge correct={item.isCorrect} />
            </div>
            <p className="mt-3 break-words text-sm font-bold leading-7 text-slate-950">
              {item.questionText}
            </p>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold leading-6 text-slate-700">
              選択: <strong className="text-slate-950">{item.selectedChoiceLabel}</strong>{" "}
              {item.selectedChoiceText}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function ResultBadge({ correct }: { correct: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${
        correct
          ? "bg-emerald-50 text-emerald-700"
          : "bg-rose-50 text-rose-700"
      }`}
    >
      {correct ? "正解" : "不正解"}
    </span>
  );
}

function EmptyHistory() {
  return (
    <p className="px-5 py-14 text-center text-sm font-bold text-slate-500">
      表示できる学習履歴がありません。
    </p>
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
    <span aria-label={label} aria-disabled="true" className={className}>
      {children}
    </span>
  ) : (
    <Link aria-label={label} href={href} className={className}>
      {children}
    </Link>
  );
}

function buildDetailHref(
  userId: string,
  tab: TeacherStudentDetailTab,
  page: number,
) {
  const params = new URLSearchParams();
  if (tab === "daily") params.set("tab", "daily");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/teacher/students/${userId}${query ? `?${query}` : ""}`;
}

function formatLatestLearning(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "学習記録なし";
}

function formatQuestionSource(item: DailyHistoryItem) {
  const parts = [item.examName];
  if (item.sourceYear) parts.push(`${item.sourceYear}年度`);
  if (item.sourceSeason) parts.push(item.sourceSeason);
  if (item.questionNo) parts.push(`問${item.questionNo}`);
  return parts.join("・");
}

function formatPoints(points: number) {
  return `${points > 0 ? "+" : ""}${points.toLocaleString()} pt`;
}
