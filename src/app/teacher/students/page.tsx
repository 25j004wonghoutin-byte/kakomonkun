import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherShell } from "@/components/teacher-shell";
import { requireTeacherPageUser } from "@/lib/teacher/auth";
import {
  listStudentLearningSummaries,
  normalizeStudentPage,
} from "@/lib/teacher/students";
import { StudentList } from "./student-list";

export const dynamic = "force-dynamic";

export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requireTeacherPageUser();
  const params = await searchParams;
  const page = normalizeStudentPage(firstValue(params.page));
  const data = await listStudentLearningSummaries(page);

  if (page > data.totalPages) {
    redirect(buildStudentPageHref(data.totalPages));
  }

  const start = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.total);

  return (
    <TeacherShell>
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="mb-5">
          <p className="text-xs font-black tracking-[0.18em] text-blue-600">
            LEARNING STATUS
          </p>
          <h1 className="mt-2 text-3xl font-black text-[#071d36]">学習状況</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
            学生ごとの回答数、正解数、正答率を確認できます。
          </p>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex min-h-[68px] items-center justify-between gap-4 border-b border-slate-200 px-5 py-3 sm:px-6">
            <h2 className="text-base font-black text-slate-950">学生一覧</h2>
            <span className="text-xs font-bold text-slate-500">
              全{data.total.toLocaleString()}人
            </span>
          </div>

          <StudentList students={data.items} />

          <div className="flex min-h-[68px] items-center justify-between gap-4 border-t border-slate-200 px-5 py-3 sm:px-6">
            <span className="text-xs font-bold text-slate-500">
              {start}–{end} / {data.total}人
            </span>
            <div className="flex items-center gap-2">
              <PaginationLink
                href={buildStudentPageHref(data.page - 1)}
                disabled={data.page <= 1}
                label="前のページ"
              >
                ‹
              </PaginationLink>
              <PaginationLink
                href={buildStudentPageHref(data.page + 1)}
                disabled={data.page >= data.totalPages}
                label="次のページ"
              >
                ›
              </PaginationLink>
            </div>
          </div>
        </section>
      </div>
    </TeacherShell>
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

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildStudentPageHref(page: number) {
  return page > 1 ? `/teacher/students?page=${page}` : "/teacher/students";
}
