"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorCard, PageHeading } from "@/components/ui";
import type { MockListView, StartResult } from "@/lib/mock-exams/contract";
import { mockRequest } from "@/lib/mock-exams/client-state";

const date=(value:string)=>new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
export function MockExamListView({data,onStart,busy}:{data:MockListView;onStart:(id:string)=>void;busy:boolean}){
  return <>
    <PageHeading eyebrow="MONTHLY MOCK EXAM" title="模擬試験" description="毎月1日から24日まで受験できます。各試験2回まで、最高点をランキングに反映します。"/>
    <div className="mb-6 flex flex-wrap items-center gap-3"><h2 className="text-xl font-black">{data.month} の模擬試験</h2><Link href="/mock-exam" className="text-sm text-blue-700 underline">当月へ</Link></div>
    <div className="grid gap-5 lg:grid-cols-2">{data.exams.map(exam=><section key={exam.examCode} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h3 className="text-xl font-black">{exam.title}</h3><p className="mt-3 text-sm">{exam.questionCount}問 / {exam.timeLimitMinutes}分 / 残り{exam.remainingAttempts}回</p>
      <p className="mt-2 text-sm text-slate-500">締切：{date(exam.closesAt)}（日本時間）</p>
      <p className="mt-4 text-sm text-slate-600">正解・解説は25日0時に公開します。初回提出で20pt、2回目はポイントなし。</p>
      <div className="mt-5">{exam.activeAttemptId?<Link prefetch={false} href={`/mock-exam/attempts/${exam.activeAttemptId}`} className="inline-block rounded-lg bg-blue-600 px-5 py-3 font-bold text-white">続きから再開</Link>:exam.state==="open"&&exam.remainingAttempts>0&&exam.id?<button type="button" disabled={busy} onClick={()=>onStart(exam.id!)} className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-slate-400">{busy?"開始を確認中…":`${3-exam.remainingAttempts}回目を開始`}</button>:<p className="font-bold text-slate-500">{exam.state==="closed"?"受験期間外":exam.state==="upcoming"?"公開前":exam.remainingAttempts===0?"2回受験済み":"準備中"}</p>}</div>
      <ul className="mt-5 space-y-2">{exam.results.map(r=><li key={r.attemptId}><Link prefetch={false} className="text-sm text-blue-700 underline" href={`/mock-exam/attempts/${r.attemptId}/result`}>{r.attemptNo}回目の結果：{r.score.toFixed(2)}点</Link></li>)}</ul>
    </section>)}</div>
    <section className="mt-8"><h2 className="font-black">過去の受験結果</h2><div className="mt-3 flex flex-wrap gap-3">{data.historyMonths.length?data.historyMonths.map(month=><Link prefetch={false} key={month} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-blue-700" href={`/mock-exam?month=${month}`}>{month}</Link>):<p className="text-sm text-slate-500">受験履歴はまだありません。</p>}</div></section>
  </>;
}

export default function MockExamList({initial}:{initial:MockListView}){
  const router=useRouter(),inFlight=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function start(id:string){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");
    try{
      const key=`mock-start:${id}`;
      const requestId=sessionStorage.getItem(key)??crypto.randomUUID();sessionStorage.setItem(key,requestId);
      const result=await mockRequest<StartResult>(`/api/mock-exams/${id}/start`,{requestId});
      sessionStorage.removeItem(key);
      router.push(result.kind==="attempt"?`/mock-exam/attempts/${result.attempt.id}`:`/mock-exam/attempts/${result.result.attemptId}/result`);
    }catch(cause){setError(cause instanceof Error?cause.message:"開始できませんでした。再試行してください。");}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <>{error?<div className="mb-5"><ErrorCard message={error}/></div>:null}<MockExamListView data={initial} onStart={start} busy={busy}/></>;
}
