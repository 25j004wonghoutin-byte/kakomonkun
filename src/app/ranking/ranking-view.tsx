"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StudentAvatar } from "@/components/student-avatar";
import { ErrorCard, PageHeading } from "@/components/ui";
import type { RankingStudentView, RankingView } from "@/lib/mock-exams/contract";
import { mockRequest } from "@/lib/mock-exams/client-state";
import { createRankingLoader, startRankingPolling } from "@/lib/mock-exams/ranking-poll";

const podiumStyles = {
  1: { card: "border-amber-200 bg-[#fffaf1]", crown: "text-amber-400", avatar: "bg-amber-100/80 ring-amber-200", title: "border-amber-300 bg-amber-100 text-amber-950" },
  2: { card: "border-blue-200 bg-[#f3f7ff]", crown: "text-slate-400", avatar: "bg-blue-100/80 ring-blue-200", title: "border-blue-300 bg-blue-100 text-blue-800" },
  3: { card: "border-orange-200 bg-[#fff5f0]", crown: "text-orange-500", avatar: "bg-orange-100/80 ring-orange-200", title: "border-orange-300 bg-orange-100 text-orange-950" },
} as const;

function Crown({ rankNo, className }: { rankNo: number; className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 80 56" className={`h-12 w-[70px] ${className}`}>
      <path d="m12 18 15 10L40 7l13 21 15-10-6 29H18L12 18Z" fill="currentColor" />
      <path d="m12 18 15 10L40 7v40H18L12 18Z" fill="white" fillOpacity=".2" />
      <rect x="18" y="47" width="44" height="5" rx="2" fill="currentColor" />
      <circle cx="11" cy="16" r="5" fill="currentColor" />
      <circle cx="40" cy="7" r="5" fill="currentColor" />
      <circle cx="69" cy="16" r="5" fill="currentColor" />
      <text x="40" y="42" textAnchor="middle" fill="white" fontSize="26" fontWeight="800">{rankNo}</text>
    </svg>
  );
}

function TitleBadge({ name, className = "border-blue-200 bg-blue-50 text-blue-700" }: { name: string | null; className?: string }) {
  return name ? <span className={`inline-block max-w-full rounded-full border px-3 py-0.5 text-xs font-bold [overflow-wrap:anywhere] ${className}`}>{name}</span> : null;
}

function PodiumCard({ student }: { student: RankingStudentView }) {
  const style = podiumStyles[student.rankNo as keyof typeof podiumStyles];
  return (
    <article className={`flex h-full min-w-0 flex-col items-center rounded-xl border px-5 pb-5 pt-3 text-center ${style.card}`}>
      <h3 className="sr-only">{`${student.rankNo}位`}</h3>
      <div className="relative flex w-40 flex-col items-center">
        <Crown rankNo={student.rankNo} className={style.crown} />
        <svg aria-hidden="true" viewBox="0 0 160 24" className={`pointer-events-none absolute top-12 h-6 w-40 ${style.crown}`} fill="currentColor">
          <path d="m15 0 3 9 9 3-9 3-3 9-3-9-9-3 9-3L15 0Zm130 0 3 9 9 3-9 3-3 9-3-9-9-3 9-3 3-9Z" opacity=".65" />
        </svg>
        <div className={`mt-1 rounded-full p-1.5 ring-1 ${style.avatar}`}>
          <StudentAvatar avatarUrl={student.avatarUrl} displayName={student.displayName} size={80} className="bg-transparent text-3xl" />
        </div>
      </div>
      <p className="mt-3 w-full text-base font-black [overflow-wrap:anywhere]">{student.displayName}</p>
      <div className="mt-2 min-h-6 w-full"><TitleBadge name={student.currentTitleName} className={style.title} /></div>
      <div className="mt-auto w-full pt-5">
        <p className="text-xs font-medium text-slate-600">最高得点</p>
        <p className="mt-1 whitespace-nowrap text-4xl font-black tracking-tight tabular-nums text-slate-950">{student.score.toFixed(2)}<span className="ml-1 text-sm font-bold">点</span></p>
        <div className="mt-3 min-h-10">
          {student.profileHref ? <Link prefetch={false} href={student.profileHref} aria-label={`${student.displayName}のプロフィールを見る`} className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50">プロフィールを見る</Link> : <span className="inline-flex min-h-10 items-center text-xs text-slate-500">プロフィール非公開</span>}
        </div>
      </div>
    </article>
  );
}

function OwnRanking({ student, participantCount }: { student: RankingStudentView; participantCount: number }) {
  const identity = <><StudentAvatar avatarUrl={student.avatarUrl} displayName={student.displayName} size={48} className="border border-blue-100 text-xl" /><span className="min-w-0"><span className="mb-1 block text-sm font-black [overflow-wrap:anywhere]">{student.displayName}</span><TitleBadge name={student.currentTitleName} /></span></>;
  return (
    <div className="grid gap-4 rounded-lg border border-blue-100 bg-white p-4 sm:grid-cols-[minmax(0,1.3fr)_1fr_1fr] sm:items-center sm:gap-5">
      {student.profileHref ? <Link prefetch={false} href={student.profileHref} className="flex min-w-0 items-center gap-3 rounded-sm hover:text-blue-700">{identity}</Link> : <div className="flex min-w-0 items-center gap-3">{identity}</div>}
      <dl className="border-t border-blue-50 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <dt className="text-xs text-slate-500">あなたの順位</dt>
        <dd className="mt-1 flex flex-wrap items-baseline gap-x-2"><strong className="text-2xl font-black tabular-nums text-slate-950">{`${student.rankNo}位`}</strong><span className="text-xs text-slate-600">/ {`${participantCount}人中`}</span></dd>
      </dl>
      <dl className="border-t border-blue-50 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <dt className="text-xs text-slate-500">最高得点</dt>
        <dd className="mt-1 whitespace-nowrap text-2xl font-black tabular-nums text-slate-950">{student.score.toFixed(2)}<span className="ml-1 text-xs font-medium text-slate-600">点</span></dd>
      </dl>
    </div>
  );
}

function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `${year}年${Number(value)}月`;
}

export function RankingViewContent({ data, onMonthChange }: { data: RankingView; onMonthChange?: (month: string) => void }) {
  const pastMonths = data.availableMonths.filter(month => month < data.currentMonth).sort().reverse();
  const isPast = data.month < data.currentMonth;
  const pastMonth = isPast ? data.month : pastMonths[0];
  const months = [...new Set([data.currentMonth, data.month, ...data.availableMonths])].sort().reverse();
  const tabClass = (active: boolean) => `flex min-h-12 flex-1 items-center justify-center border-b-2 px-3 text-center text-sm font-bold transition ${active ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-blue-700"}`;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeading title="ランキング" />
      <nav aria-label="試験を選択" className="mb-5 flex flex-wrap gap-2">
        {(["it_passport", "fe"] as const).map(code => <Link prefetch={false} key={code} aria-current={code === data.examCode ? "page" : undefined} className={`rounded-lg border px-4 py-2.5 text-sm font-bold transition ${code === data.examCode ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`} href={`/ranking?examCode=${code}&month=${data.month}`}>{code === "fe" ? "基本情報技術者（科目A）" : "ITパスポート"}</Link>)}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-x-5 border-b border-slate-200">
        <nav aria-label="ランキングの期間" className="flex w-full sm:w-auto sm:min-w-80">
          <Link prefetch={false} aria-current={!isPast ? "page" : undefined} className={tabClass(!isPast)} href={`/ranking?examCode=${data.examCode}&month=${data.currentMonth}`}>今月のランキング</Link>
          {pastMonth ? <Link prefetch={false} aria-current={isPast ? "page" : undefined} className={tabClass(isPast)} href={`/ranking?examCode=${data.examCode}&month=${pastMonth}`}>過去のランキング</Link> : <span aria-disabled="true" className="flex min-h-12 flex-1 items-center justify-center px-3 text-sm font-bold text-slate-400">過去のランキング</span>}
        </nav>
        <label className="my-3 ml-auto">
          <span className="sr-only">対象月を選択</span>
          <select aria-label="対象月を選択" value={data.month} onChange={event => onMonthChange?.(event.target.value)} className="min-h-10 min-w-40 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-600">
            {months.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </select>
        </label>
      </div>
      <div className="mb-5 mt-4 flex flex-wrap items-center justify-between gap-2 text-xs leading-6">
        <p className="text-slate-600">{`模擬試験（${data.examCode === "fe" ? "基本情報技術者・科目A" : "ITパスポート"}）の最高得点でランキングを集計しています。`}</p>
        <p className="font-bold text-blue-700" role="status">{data.state === "final" ? data.rewardsComplete ? "確定・報酬反映済み" : "順位確定・報酬反映中" : data.state === "settling" ? "集計中" : "暫定順位・15秒ごとに更新"}</p>
      </div>
      <section aria-label="上位3順位">
        <h2 className="sr-only">上位3順位</h2>
        {data.top.length ? <ol className="grid gap-4 sm:grid-cols-3 lg:gap-5">{data.top.map(student => <li className="min-w-0" key={student.userId}><PodiumCard student={student} /></li>)}</ol> : <p className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">提出済みの受験結果はまだありません。</p>}
      </section>
      <section aria-labelledby="own-ranking-heading" className="mt-5 rounded-xl border border-blue-200 bg-blue-50/80 p-3 sm:p-4">
        <h2 id="own-ranking-heading" className="mb-3 text-sm font-black text-blue-700">あなたの順位</h2>
        {data.mine ? <OwnRanking student={data.mine} participantCount={data.participantCount} /> : <p className="rounded-lg border border-blue-100 bg-white p-5 text-sm text-slate-500">この試験・月には、まだ提出した結果がありません。</p>}
      </section>
      <p className="mt-4 text-xs leading-6 text-slate-500">※ 同点は同順位とし、3位以内の全員を表示します。最高得点は100点満点で表示しています。</p>
      <p className="mt-1 text-xs leading-6 text-slate-500">25日0時の締切後に順位を確定し、順位報酬と称号の購入条件を反映します。正解・解説も締切後に公開します。</p>
      <Link prefetch={false} href="/mock-exam" className="mt-4 inline-flex min-h-10 items-center text-sm font-bold text-blue-700 underline underline-offset-4">模擬試験へ</Link>
    </div>
  );
}
export default function Ranking({initial}:{initial:RankingView}){
  const router=useRouter();
  const [data,setData]=useState(initial),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const loader=createRankingLoader(url=>mockRequest<RankingView>(url),value=>{setData(value);setError("");});
    const key=`/api/rankings?examCode=${initial.examCode}&month=${initial.month}`;
    const stop=startRankingPolling({refresh:async()=>{try{await loader.refresh(key);}catch{if(active)setError("最新順位を取得できません。接続を確認してください。");}},visibility:()=>document.visibilityState==="visible",subscribe:callback=>{document.addEventListener("visibilitychange",callback);return()=>document.removeEventListener("visibilitychange",callback);}});
    return()=>{active=false;stop();loader.dispose();};
  },[initial.examCode,initial.month]);
  return <>{error?<div className="mb-4"><ErrorCard message={error}/></div>:null}<RankingViewContent data={data} onMonthChange={month=>router.push(`/ranking?examCode=${data.examCode}&month=${month}`)}/></>;
}
