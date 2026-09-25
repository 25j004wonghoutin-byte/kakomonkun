import Link from "next/link";
import { StudentList } from "@/app/teacher/students/student-list";
import { TeacherShell } from "@/components/teacher-shell";
import { requireTeacherPageUser } from "@/lib/teacher/auth";
import { getTeacherDashboardData } from "@/lib/teacher/dashboard";

export const dynamic = "force-dynamic";

export default async function TeacherHomePage() {
  await requireTeacherPageUser();
  const data = await getTeacherDashboardData();

  return (
    <TeacherShell>
      <div className="mx-auto w-full max-w-[1120px]">
        <p className="text-xs font-black tracking-[0.18em] text-blue-600">
          TEACHER DASHBOARD
        </p>
        <h1 className="mt-2 text-3xl font-black text-[#071d36]">教師ホーム</h1>

        <section className="mt-6 overflow-hidden rounded-2xl bg-[#184f7d] px-6 py-7 text-white shadow-[0_20px_50px_-30px_rgba(2,31,61,0.85)] sm:px-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black tracking-[0.16em] text-blue-100">
                TODAY&apos;S MANAGEMENT
              </p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                今日の管理を始めましょう
              </h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-blue-100">
                学生の進捗確認や掲示板への投稿ができます。
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/teacher/students"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-black text-[#123f68] transition hover:bg-blue-50"
              >
                学生の学習状況を見る
              </Link>
              <Link
                href="/board"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/50 px-5 text-sm font-black text-white transition hover:bg-white/10"
              >
                掲示板に投稿する
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-label="教師ホームの集計"
          className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-4"
        >
          <DashboardStat label="登録学生" value={data.registeredStudentCount} unit="人" />
          <DashboardStat
            label="今月学習した学生"
            value={data.activeStudentCountThisMonth}
            unit="人"
          />
          <DashboardStat label="今週の回答" value={data.answerCountThisWeek} unit="問" />
          <DashboardStat label="固定中のお知らせ" value={data.pinnedNoticeCount} unit="件" />
        </section>

        <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex min-h-[68px] items-center justify-between gap-4 border-b border-slate-200 px-5 py-3 sm:px-6">
            <div>
              <h2 className="text-base font-black text-slate-950">学生の最新状況</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                最近学習した学生から表示しています。
              </p>
            </div>
            <Link
              href="/teacher/students"
              className="inline-flex min-h-11 shrink-0 items-center text-xs font-black text-blue-700 hover:text-blue-900"
            >
              すべて表示 →
            </Link>
          </div>
          <StudentList students={data.recentStudents} compact />
        </section>
      </div>
    </TeacherShell>
  );
}

function DashboardStat({
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
