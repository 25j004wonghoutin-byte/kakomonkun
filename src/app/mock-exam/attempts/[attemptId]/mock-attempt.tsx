"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QuestionChoiceContent } from "@/components/question-choice-content";
import { ErrorCard } from "@/components/ui";
import type { AttemptView, MockQuestionView, ResultView, SaveInput, SaveResult, StartResult } from "@/lib/mock-exams/contract";
import { createAnswerQueue, mockRequest } from "@/lib/mock-exams/client-state";

export function MockQuestionBody({question}:{question:MockQuestionView}){
  return <><p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{question.questionText}</p>{question.imagePath?<Image src={question.imagePath} alt="問題画像" width={1400} height={900} className="mt-4 h-auto max-w-full rounded-lg border border-slate-200"/>:null}<p className="mt-3 text-right text-xs text-slate-500">出典：{question.sourceLabel}</p></>;
}
type ViewProps={attempt:AttemptView;index:number;remainingSeconds:number;saving:boolean;blocked:boolean;onSelect:(id:string|null)=>void;onMove:(index:number)=>void;onSubmit:()=>void};
export function MockAttemptView({attempt,index,remainingSeconds,saving,blocked,onSelect,onMove,onSubmit}:ViewProps){
  const q=attempt.questions[index],answer=attempt.answers.find(a=>a.mockQuestionId===q.id),unanswered=attempt.answers.filter(a=>a.selectedChoiceId===null).length;
  const time=`${Math.floor(remainingSeconds/60)}:${String(remainingSeconds%60).padStart(2,"0")}`;
  return <div className="mx-auto max-w-4xl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-black">模擬試験 {attempt.attemptNo}回目</h1><p className="font-bold tabular-nums" role="timer">残り {time}</p></div>
    <div className="mb-4 flex flex-wrap justify-between gap-2 text-sm"><p>未回答{unanswered}問 / {attempt.questions.length}問</p><p role="status" aria-live="polite">{blocked?"未保存・確認が必要です":saving?"保存中…":"保存済み"}</p></div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h2 tabIndex={-1} id="mock-question-heading" className="mb-5 font-black">問{index+1}</h2><MockQuestionBody question={q}/>
      <fieldset className="mt-5 space-y-2" disabled={blocked||remainingSeconds===0}><legend className="sr-only">回答を選択</legend>{q.choices.map(c=><button key={c.id} type="button" aria-pressed={answer?.selectedChoiceId===c.id} onClick={()=>onSelect(c.id)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm disabled:opacity-50 ${answer?.selectedChoiceId===c.id?"border-blue-600 bg-blue-50 ring-1 ring-blue-600":"border-slate-200 hover:bg-slate-50"}`}><span className="font-bold">{c.label}</span><QuestionChoiceContent text={c.text} label={c.label}/></button>)}<button type="button" onClick={()=>onSelect(null)} className="min-h-11 px-3 text-sm text-slate-600 underline">選択を解除</button></fieldset>
      <div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" disabled={index===0} onClick={()=>onMove(index-1)} className="min-h-11 rounded-lg border border-slate-200 px-5 disabled:opacity-40">前の問題</button><button type="button" disabled={index===attempt.questions.length-1} onClick={()=>onMove(index+1)} className="min-h-11 rounded-lg border border-slate-200 px-5 disabled:opacity-40">次の問題</button></div>
    </section>
    <nav aria-label="問題番号" className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10">{attempt.questions.map((item,i)=><button type="button" key={item.id} onClick={()=>onMove(i)} aria-label={`${i+1}問目へ`} aria-current={index===i?"step":undefined} className={`min-h-10 rounded-lg border text-sm ${index===i?"bg-blue-600 text-white":attempt.answers.find(a=>a.mockQuestionId===item.id)?.selectedChoiceId?"border-blue-200 bg-blue-50":"border-slate-200 bg-white"}`}>{i+1}</button>)}</nav>
    <div className="mt-6 flex flex-wrap justify-between gap-3"><Link href="/mock-exam" prefetch={false} className="py-3 text-sm text-blue-700 underline">一覧へ（時間は止まりません）</Link><button type="button" disabled={blocked||saving||remainingSeconds===0} onClick={onSubmit} className="rounded-lg bg-blue-600 px-6 py-3 font-bold text-white disabled:bg-slate-400">提出を確認</button></div>
  </div>;
}

export default function MockAttempt({initial}:{initial:AttemptView}){
  const router=useRouter(),confirmed=useRef(initial),anchor=useRef({server:+new Date(initial.serverNow),client:0});
  const [attempt,setAttempt]=useState(initial),[index,setIndex]=useState(0),[remaining,setRemaining]=useState(Math.max(0,Math.ceil((+new Date(initial.expiresAt)-+new Date(initial.serverNow))/1000)));
  const [saving,setSaving]=useState(false),[blocked,setBlocked]=useState(false),[error,setError]=useState(""),[submitting,setSubmitting]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),expiredRead=useRef(false);
  const [lastFailed,setLastFailed]=useState<SaveInput|null>(null);
  const queue=useRef<ReturnType<typeof createAnswerQueue>|null>(null),busy=useRef(false),mounted=useRef(true),pendingSaves=useRef(0);
  const base=`/api/mock-exams/attempts/${initial.id}`;
  const accept=(view:AttemptView)=>{confirmed.current=view;anchor.current={server:+new Date(view.serverNow),client:performance.now()};if(mounted.current)setAttempt(view);};
  const showResult=(id:string)=>router.replace(`/mock-exam/attempts/${id}/result`);
  async function reload():Promise<StartResult>{
    const view=await mockRequest<StartResult>(base);
    if(view.kind==="result")showResult(view.result.attemptId);else accept(view.attempt);
    return view;
  }
  function newQueue(){
    return createAnswerQueue(async input=>{
      const before=confirmed.current,previous=before.answers.find(a=>a.mockQuestionId===input.mockQuestionId);
      const response=await mockRequest<SaveResult>(`${base}/answer`,{mockQuestionId:input.mockQuestionId,selectedChoiceId:input.selectedChoiceId,expectedRevision:input.expectedRevision,requestId:input.requestId});
      if(response.kind==="submitted"){showResult(response.result.attemptId);return response;}
      const expected=before.revision+(previous?.selectedChoiceId===input.selectedChoiceId?0:1);
      if(response.attemptRevision!==expected)throw Object.assign(new Error("別の画面で回答が更新されました。最新状態を確認してください。"),{status:409});
      accept({...before,revision:response.attemptRevision,serverNow:response.serverNow,answers:before.answers.map(a=>a.mockQuestionId===response.answer.mockQuestionId?response.answer:a)});
      return response;
    },reload);
  }
  // キューはイベント時だけ生成する。SSR/RSCには回答以外のデータを持たせない。
  function getQueue(){return queue.current??(queue.current=newQueue());}
  useEffect(()=>{
    mounted.current=true;anchor.current.client=performance.now();
    const tick=()=>setRemaining(Math.max(0,Math.ceil((+new Date(initial.expiresAt)-anchor.current.server-(performance.now()-anchor.current.client))/1000)));
    const timer=setInterval(tick,500);tick();return()=>{mounted.current=false;clearInterval(timer);};
  },[initial.expiresAt]);
  useEffect(()=>{
    if(remaining!==0||expiredRead.current)return;expiredRead.current=true;
    mockRequest<StartResult>(base).then(view=>{if(view.kind==="result")showResult(view.result.attemptId);}).catch(()=>{setBlocked(true);setError("受験時間が終了しました。接続を確認して最新状態を読み込んでください。未保存の回答は採用されません。");});
  // base and router are stable for this mounted attempt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[remaining,base]);
  async function save(choice:string|null,retry?:SaveInput){
    if(busy.current||remaining===0||(!retry&&blocked))return;
    pendingSaves.current++;setSaving(true);setError("");
    const q=confirmed.current.questions[index],a=confirmed.current.answers.find(v=>v.mockQuestionId===q.id)!;
    const input=retry??{attemptId:initial.id,mockQuestionId:q.id,selectedChoiceId:choice,expectedRevision:a.revision,requestId:crypto.randomUUID()};
    try{await getQueue().save(input);setLastFailed(null);setBlocked(false);}catch(cause){setLastFailed(previous=>previous??input);setBlocked(true);setError(cause instanceof Error?cause.message:"保存できませんでした。");}
    finally{pendingSaves.current--;setSaving(pendingSaves.current>0);}
  }
  async function reconcile(){
    if(busy.current)return;busy.current=true;setSaving(true);
    try{await reload();queue.current=null;setLastFailed(null);setBlocked(false);setError("");}
    catch{setError("最新状態を取得できません。接続を確認してください。");}
    finally{busy.current=false;setSaving(false);}
  }
  async function openSubmit(){
    try{await getQueue().flush();dialog.current?.showModal();}catch{setBlocked(true);setError("未保存の回答があります。提出前に最新状態を確認してください。");}
  }
  async function submit(){
    if(busy.current)return;busy.current=true;setSubmitting(true);
    try{
      await getQueue().flush();
      const result=await mockRequest<ResultView>(`${base}/submit`,{expectedRevision:confirmed.current.revision});showResult(result.attemptId);
    }catch(cause){dialog.current?.close();setBlocked(true);setError(cause instanceof Error?cause.message:"提出を確認できません。最新状態を読み込んでください。");try{await reload();}catch{/* 不明な提出結果は再取得で回復する。 */}}
    finally{busy.current=false;setSubmitting(false);}
  }
  function move(to:number){setIndex(to);requestAnimationFrame(()=>document.getElementById("mock-question-heading")?.focus());}
  return <>{error?<div className="mx-auto mb-5 max-w-4xl"><ErrorCard message={error}/><div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={saving||submitting} onClick={reconcile} className="rounded-lg border bg-white px-4 py-3 text-sm">最新状態を読み込み・確認する</button>{lastFailed&&remaining>0?<button type="button" disabled={saving||submitting} onClick={()=>save(null,lastFailed!)} className="rounded-lg border bg-white px-4 py-3 text-sm">同じ保存を再試行</button>:null}</div></div>:null}
    <MockAttemptView attempt={attempt} index={index} remainingSeconds={remaining} saving={saving||submitting} blocked={blocked} onSelect={choice=>save(choice)} onMove={move} onSubmit={openSubmit}/>
    <dialog ref={dialog} onCancel={event=>{if(submitting)event.preventDefault();}} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/40" aria-labelledby="mock-submit-title"><h2 id="mock-submit-title" className="text-lg font-black">この回答で提出しますか？</h2><p className="mt-4 text-sm">未回答{attempt.answers.filter(a=>a.selectedChoiceId===null).length}問。提出後は回答を変更できません。</p><div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" autoFocus disabled={submitting} onClick={()=>dialog.current?.close()} className="rounded-lg border px-4 py-3">キャンセル</button><button type="button" disabled={submitting} onClick={submit} className="rounded-lg bg-blue-600 px-4 py-3 text-white">{submitting?"提出を確認中…":"提出する"}</button></div></dialog>
  </>;
}
