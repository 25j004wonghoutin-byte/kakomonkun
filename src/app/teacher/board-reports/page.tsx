import Link from "next/link";
import { TeacherShell } from "@/components/teacher-shell";
import { BOARD_REPORT_REASONS, formatBoardDateTime } from "@/lib/board/moderation-contract";
import { listBoardReports } from "@/lib/board/reports";
import { isUuid } from "@/lib/board/validation";
import { requireTeacherPageUser } from "@/lib/teacher/auth";
import { displayNameForRole } from "@/lib/teacher/identity";
import { markBoardReportResolved } from "./actions";

const pagePath = "/teacher/board-reports";

export const metadata = { title: "掲示板の通報" };

export default async function BoardReportsPage({ searchParams }: {
  searchParams: Promise<{ status?: string; after?: string }>;
}) {
  const teacher = await requireTeacherPageUser();
  const { status, after } = await searchParams;
  const resolved = status === "resolved";
  const { reports, nextCursor } = await listBoardReports(resolved, isUuid(after) ? after : null);
  const nextQuery = new URLSearchParams({ status: resolved ? "resolved" : "pending" });
  if (nextCursor) nextQuery.set("after", nextCursor);

  return (
    <TeacherShell userId={teacher.id}>
      <div className="mx-auto w-full max-w-[960px]">
        <h1 className="text-3xl font-black text-[#242823]">掲示板の通報</h1>
        <section className="mt-5 rounded-xl border border-slate-200 bg-white">
          <nav aria-label="通報の対応状況" className="flex gap-5 border-b border-slate-200 px-4 sm:px-6">
            <ReportTab href={pagePath} current={!resolved}>未対応</ReportTab>
            <ReportTab href={pagePath + "?status=resolved"} current={resolved}>対応済み</ReportTab>
          </nav>
          {reports.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-600">{resolved ? "対応済みの通報はありません。" : "未対応の通報はありません。"}</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {reports.map((report) => {
                const { post } = report;
                const reason = BOARD_REPORT_REASONS.find(({ value }) => value === report.reason)?.label;
                return (
                  <li key={report.id} className="px-4 py-5 sm:px-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h2 className="font-bold text-slate-950">{reason}</h2>
                      <time dateTime={report.createdAt.toISOString()} className="text-sm text-slate-600">{formatBoardDateTime(report.createdAt)}</time>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">投稿者 {displayNameForRole(post.author.role.name, post.author.displayName)}</p>
                    {post.deletedAt ? <p className="mt-2 text-sm text-slate-600">この投稿は削除されています。</p> : (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-900">{post.body}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                      {!post.deletedAt ? <Link href={`/board/posts/${post.id}`} className="inline-flex min-h-11 items-center font-bold text-blue-800 hover:underline">投稿を確認</Link> : null}
                      {post.author.role.name === "student" ? (
                        <Link href={`/teacher/students/${post.author.id}#board-restriction`} className="inline-flex min-h-11 items-center font-bold text-blue-800 hover:underline">投稿者の利用制限</Link>
                      ) : null}
                      {!report.resolvedAt ? (
                        <form action={markBoardReportResolved}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <button type="submit" className="min-h-11 rounded-lg border border-slate-300 px-3 font-bold text-slate-800 hover:bg-slate-50">対応済みにする</button>
                        </form>
                      ) : <span className="text-slate-600">対応 {formatBoardDateTime(report.resolvedAt)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {nextCursor ? (
            <div className="border-t border-slate-200 px-4 py-2 sm:px-6">
              <Link href={pagePath + "?" + nextQuery.toString()} className="inline-flex min-h-11 items-center text-sm font-bold text-blue-800 hover:underline">次の25件</Link>
            </div>
          ) : null}
        </section>
      </div>
    </TeacherShell>
  );
}

function ReportTab({ href, current, children }: { href: string; current: boolean; children: string }) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={`inline-flex min-h-12 items-center border-b-2 text-sm font-bold ${current ? "border-blue-700 text-blue-800" : "border-transparent text-slate-600 hover:text-blue-800"}`}>
      {children}
    </Link>
  );
}
