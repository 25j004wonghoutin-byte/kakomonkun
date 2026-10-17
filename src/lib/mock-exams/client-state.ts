import type { SaveInput, SaveResult, StartResult } from "./contract";

/** 保存失敗は提出可能な状態に変換しない。回復時は同じ有効payload/IDを再送する。 */
export function createAnswerQueue(send:(input:SaveInput)=>Promise<SaveResult>,reload:()=>Promise<StartResult>){
  let tail:Promise<unknown>=Promise.resolve(),pending=0,finished:SaveResult|null=null;
  const failures=new Map<string,unknown>();
  const operations=new Map<string,{input:SaveInput;effective?:SaveInput;running?:Promise<SaveResult>}>();
  const versions=new Map<string,{first:number;latest:number}>();
  return {
    save(input:SaveInput):Promise<SaveResult>{
      const previous=operations.get(input.requestId);
      if(previous&&JSON.stringify(previous.input)!==JSON.stringify(input))return Promise.reject(new Error("同じ要求IDの内容を変更できません。"));
      if(previous?.running)return previous.running;
      const operation=previous??{input:{...input}};
      operations.set(input.requestId,operation);pending++;
      const run=tail.then(async()=>{
        if(finished)return finished;
        if(failures.size&&!failures.has(input.requestId))throw new Error("未保存の回答があります。最新状態を確認してください。");
        const known=versions.get(input.mockQuestionId);
        operation.effective??={...input,expectedRevision:known&&input.expectedRevision>=known.first&&input.expectedRevision<=known.latest?known.latest:input.expectedRevision};
        try{
          const result=await send(operation.effective);
          failures.delete(input.requestId);
          if(result.kind==="submitted")finished=result;
          else versions.set(input.mockQuestionId,{first:known?.first??input.expectedRevision,latest:result.answer.revision});
          return result;
        }catch(cause){
          failures.set(input.requestId,cause);
          try{await reload();}catch{/* 元の保存エラーを保ち、保存済みとは表示しない。 */}
          throw cause;
        }
      }).finally(()=>{pending--;operation.running=undefined;});
      operation.running=run;tail=run.catch(()=>undefined);return run;
    },
    async flush():Promise<void>{await tail;if(failures.size)throw failures.values().next().value;},
    hasPending():boolean{return pending>0||failures.size>0;},
  };
}

export async function mockRequest<T>(url:string,body?:unknown):Promise<T>{
  let response:Response;
  try{response=await fetch(url,{cache:"no-store",...(body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});}
  catch{throw new Error("接続を確認してください。保存・提出の完了を確認できませんでした。");}
  let data;
  try{data=await response.json();}catch{throw new Error("応答を確認できません。接続を確認して最新状態を読み込んでください。");}
  if(!response.ok)throw Object.assign(new Error(typeof data.error==="string"?data.error:"模擬試験を処理できませんでした。"),{status:response.status,code:data.code});
  return data as T;
}
