import Link from "next/link";
import type { TeacherMockView } from "@/lib/teacher/mock-exams";

const states = { not_started: "未開始", in_progress: "受験中", submitted: "提出済み" };
const examStates = { preparing: "準備中", upcoming: "公開前", open: "受験期間中", closed: "受験期間終了" };
const rankingStates = { provisional: "暫定順位", settling: "集計中", final: "確定順位" };
const dateTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });
const score = (value: number | null) => value === null ? "—" : value.toFixed(2);

export function MockExamStatus({ data }: { data: TeacherMockView }) {
  const href = (cursor?: string) => `/teacher/mock-exams?examCode=${data.examCode}&month=${data.month}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  return <div className="mx-auto w-full max-w-[1120px] space-y-6">
    <header><h1 className="text-3xl font-black text-[#242823]">模擬試験状況</h1></header>
    <form action="/teacher/mock-exams" method="get" autoComplete="off" className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <label className="flex min-w-0 flex-col gap-2 text-sm font-bold">試験種別<select name="examCode" defaultValue={data.examCode} className="min-h-11 max-w-full rounded-lg border border-slate-300 px-3"><option value="it_passport">ITパスポート</option><option value="fe">基本情報（科目A）</option></select></label>
      <label className="flex flex-col gap-2 text-sm font-bold">対象月<input type="month" name="month" required defaultValue={data.month} min="0001-01" className="min-h-11 rounded-lg border border-slate-300 px-3" /></label>
      <button type="submit" className="min-h-11 rounded-lg bg-blue-600 px-6 text-sm font-bold text-white">表示する</button>
    </form>
    {data.exam ? <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-black">{data.exam.title}</h2><p className="mt-2 text-sm text-slate-600">{examStates[data.exam.state]} · {data.exam.questionCount}問 / {data.exam.timeLimitMinutes}分</p><p className="mt-2 text-xs leading-6 text-slate-500">日本時間 {dateTime.format(new Date(data.exam.opensAt))} ～ {dateTime.format(new Date(data.exam.closesAt))}（締切時刻は受験不可）</p><p className="mt-2 text-sm font-bold text-blue-700">{rankingStates[data.exam.rankingState]}{data.exam.rankingState === "final" ? data.exam.rewardsComplete ? " · 報酬配布完了" : " · 報酬配布中" : ""}</p></section> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm">この月・試験の問題はまだ準備されていません。</p>}
    <section aria-label="受験人数" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["対象学生",data.targetStudentCount],...Object.entries(data.counts).map(([key,value])=>[states[key as keyof typeof states],value])].map(([label,value])=><article key={label} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold text-slate-500">{label}</p><strong className="mt-2 block text-2xl font-black">{value}<span className="ml-1 text-xs text-slate-500">人</span></strong></article>)}</section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-5"><h2 className="font-black">学生ごとの結果</h2><p className="mt-2 text-xs leading-5 text-slate-500">対象は現在利用可能で、その月の締切より前に登録された学生です。提出済みの点数だけを表示します。期限切れ未採点分は受験中に含み、集計処理後に反映します。</p></div>
      {data.students.length ? <ul className="divide-y divide-slate-100">{data.students.map(student=><li key={student.userId} className="p-5"><div className="flex flex-wrap justify-between gap-2"><strong className="min-w-0 break-all text-sm">{student.name}</strong><span className="text-xs font-bold text-blue-700">{states[student.status]}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["1回目",score(student.attempt1Score)],["2回目",score(student.attempt2Score)],["最高点",score(student.bestScore)],["順位",student.rankNo===null?"—":`${student.rankNo}位`]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold tabular-nums">{value}</dd></div>)}</dl></li>)}</ul>:<p className="p-8 text-center text-sm text-slate-500">対象の学生はいません。</p>}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 p-5"><Link href={href()} className="text-sm font-bold text-blue-700">先頭へ戻る</Link><span className="text-xs text-slate-500">このページ {data.students.length}人 / 全{data.targetStudentCount}人</span>{data.nextCursor?<Link href={href(data.nextCursor)} className="rounded-lg border border-blue-200 px-4 py-3 text-sm font-bold text-blue-700">次の100人 →</Link>:null}</div>
    </section>
  </div>;
}
