"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StudentAvatar } from "@/components/student-avatar";
import { ErrorCard, PageHeading } from "@/components/ui";
import type { RankingStudentView, RankingView } from "@/lib/mock-exams/contract";
import { mockRequest } from "@/lib/mock-exams/client-state";
import { createRankingLoader, startRankingPolling } from "@/lib/mock-exams/ranking-poll";

function RankRow({student,mine=false}:{student:RankingStudentView;mine?:boolean}){
  const name=<span className="flex min-w-0 items-center gap-3"><StudentAvatar avatarUrl={student.avatarUrl} displayName={student.displayName} size={36}/><span className="min-w-0"><span className="block break-words font-bold">{student.displayName}</span>{student.currentTitleName?<span className="mt-1 block break-words text-xs text-blue-700">{student.currentTitleName}</span>:null}</span></span>;
  return <li className={`flex min-w-0 items-center gap-3 border-b border-slate-100 p-4 last:border-0 ${mine?"bg-blue-50":""}`}><span className="w-10 shrink-0 font-black text-blue-700">{student.rankNo}位</span><span className="min-w-0 flex-1">{student.profileHref?<Link className="hover:text-blue-700" href={student.profileHref}>{name}</Link>:name}</span><span className="shrink-0 font-black tabular-nums">{student.score.toFixed(2)}<span className="ml-1 text-xs font-normal">点</span></span></li>;
}
export function RankingViewContent({data}:{data:RankingView}){
  return <>
    <PageHeading eyebrow="MONTHLY RANKING" title="ランキング" description="試験別・月別の最高点を表示します。同点は同順位で、3位以内の全員を表示します。"/>
    <nav aria-label="試験を選択" className="mb-4 flex flex-wrap gap-3">{(["it_passport","fe"] as const).map(code=><Link prefetch={false} key={code} aria-current={code===data.examCode?"page":undefined} className={`rounded-lg border px-4 py-3 text-sm font-bold ${code===data.examCode?"border-blue-600 bg-blue-600 text-white":"border-slate-200 bg-white text-slate-700"}`} href={`/ranking?examCode=${code}&month=${data.month}`}>{code==="fe"?"基本情報技術者（科目A）":"ITパスポート"}</Link>)}</nav>
    <nav aria-label="対象月を選択" className="mb-6 flex flex-wrap gap-2">{data.availableMonths.map(month=><Link prefetch={false} key={month} aria-current={month===data.month?"page":undefined} className={`rounded-lg px-3 py-2 text-sm ${month===data.month?"bg-blue-100 font-bold text-blue-800":"bg-white text-slate-600"}`} href={`/ranking?examCode=${data.examCode}&month=${month}`}>{month}</Link>)}</nav>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">{data.month} の順位</h2><p className="text-sm font-bold text-blue-700" role="status">{data.state==="final"?data.rewardsComplete?"確定・報酬反映済み":"順位確定・報酬反映中":data.state==="settling"?"集計中":"暫定順位・15秒ごとに更新"}</p></div>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><h3 className="border-b border-slate-200 p-4 font-black">上位3順位</h3>{data.top.length?<ol>{data.top.map(student=><RankRow key={student.userId} student={student} mine={student.userId===data.mine?.userId}/>)}</ol>:<p className="p-6 text-sm text-slate-500">提出済みの受験結果はまだありません。</p>}</section>
    <section className="mt-6 overflow-hidden rounded-xl border border-blue-200 bg-white"><h3 className="border-b border-blue-100 p-4 font-black">自分の順位</h3>{data.mine?<ol><RankRow student={data.mine} mine/></ol>:<p className="p-6 text-sm text-slate-500">この試験・月には、まだ提出した結果がありません。</p>}</section>
    <p className="mt-5 text-xs leading-6 text-slate-500">25日0時の締切後に順位を確定し、順位報酬と称号の購入条件を反映します。正解・解説も締切後に公開します。</p><Link prefetch={false} href="/mock-exam" className="mt-5 inline-block text-sm text-blue-700 underline">模擬試験へ</Link>
  </>;
}
export default function Ranking({initial}:{initial:RankingView}){
  const [data,setData]=useState(initial),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const loader=createRankingLoader(url=>mockRequest<RankingView>(url),value=>{setData(value);setError("");});
    const key=`/api/rankings?examCode=${initial.examCode}&month=${initial.month}`;
    const stop=startRankingPolling({refresh:async()=>{try{await loader.refresh(key);}catch{if(active)setError("最新順位を取得できません。接続を確認してください。");}},visibility:()=>document.visibilityState==="visible",subscribe:callback=>{document.addEventListener("visibilitychange",callback);return()=>document.removeEventListener("visibilitychange",callback);}});
    return()=>{active=false;stop();loader.dispose();};
  },[initial.examCode,initial.month]);
  return <>{error?<div className="mb-4"><ErrorCard message={error}/></div>:null}<RankingViewContent data={data}/></>;
}
