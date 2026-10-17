import { MockError, type MockActor, type MockServices } from "./contract";
import { readMockEnvironment } from "./environment";
import { assertMockStudent } from "./locks";
import { getMockPolicy, getMockSchedule } from "./schedule";

export const mockHeaders={"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie"};
const invalid=()=>new MockError("invalid_input",400,"入力内容を確認してください。");
const uuid=(value:unknown):string=>{
  if(typeof value!=="string"||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))throw invalid();
  return value;
};
const revision=(value:unknown):number=>{
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)throw invalid();
  return value;
};
async function body(request:Request,keys:string[]):Promise<Record<string,unknown>>{
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw invalid();
  let value:unknown;
  try { value=await request.json(); } catch { throw invalid(); }
  if(!value||typeof value!=="object"||Array.isArray(value))throw invalid();
  if(Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))throw invalid();
  return value as Record<string,unknown>;
}
function query(request:Request,keys:string[]):URLSearchParams{
  const values=new URL(request.url).searchParams;
  if([...values.keys()].some(k=>!keys.includes(k))||keys.some(k=>values.getAll(k).length!==1))throw invalid();
  return values;
}
function month(value:unknown):string{
  if(typeof value!=="string")throw invalid();
  getMockSchedule(value);return value;
}
function sameOrigin(request:Request):boolean{
  const target=new URL(request.url),host=request.headers.get("host");
  if(host){
    try{
      const authority=new URL(`${target.protocol}//${host}`);
      if(authority.host!==host.toLowerCase()||authority.username||authority.password||authority.pathname!=="/"||authority.search||authority.hash)return false;
      target.host=host;
    }catch{return false;}
  }
  return request.headers.get("origin")===target.origin;
}

export function createMockHandlers({getUser,services}:{getUser:()=>Promise<MockActor|null>;services:MockServices}){
  function run(request:Request,mutation:boolean,work:(actor:MockActor)=>Promise<unknown>):Promise<Response>{
    return (async()=>{
      try {
        const actor=await getUser();
        if(!actor)throw new MockError("unauthorized",401,"ログインしてください。");
        assertMockStudent(actor);
        if(!readMockEnvironment(process.env).enabled)throw new MockError("mock_disabled",503,"模擬試験は現在準備中です。");
        if(mutation&&!sameOrigin(request))throw new MockError("origin",403,"この操作は利用できません。");
        return Response.json(await work(actor),{headers:mockHeaders});
      } catch(cause){
        return Response.json({error:cause instanceof MockError?cause.message:"模擬試験を処理できませんでした。しばらくしてからお試しください。",code:cause instanceof MockError?cause.code:"internal_error"},
          {status:cause instanceof MockError?cause.status:500,headers:mockHeaders});
      }
    })();
  }
  return {
    list:(request:Request)=>run(request,false,actor=>services.getMockList(actor,month(query(request,["month"]).get("month")))),
    start:(request:Request,params?:Record<string,string>)=>run(request,true,async actor=>{
      const mockExamId=uuid(params?.mockExamId),input=await body(request,["requestId"]);
      return services.startMockAttempt(actor,{mockExamId,requestId:uuid(input.requestId)});
    }),
    attempt:(request:Request,params?:Record<string,string>)=>run(request,false,actor=>services.getMockAttempt(actor,uuid(params?.attemptId))),
    answer:(request:Request,params?:Record<string,string>)=>run(request,true,async actor=>{
      const attemptId=uuid(params?.attemptId),input=await body(request,["mockQuestionId","selectedChoiceId","expectedRevision","requestId"]);
      return services.saveMockAnswer(actor,{attemptId,mockQuestionId:uuid(input.mockQuestionId),selectedChoiceId:input.selectedChoiceId===null?null:uuid(input.selectedChoiceId),expectedRevision:revision(input.expectedRevision),requestId:uuid(input.requestId)});
    }),
    submit:(request:Request,params?:Record<string,string>)=>run(request,true,async actor=>{
      const attemptId=uuid(params?.attemptId),input=await body(request,["expectedRevision"]);
      return services.submitMockAttempt(actor,{attemptId,expectedRevision:revision(input.expectedRevision)});
    }),
    result:(request:Request,params?:Record<string,string>)=>run(request,false,actor=>services.getMockResult(actor,uuid(params?.attemptId))),
    ranking:(request:Request)=>run(request,false,actor=>{
      const values=query(request,["examCode","month"]),code=values.get("examCode");
      if(code!=="it_passport"&&code!=="fe")throw invalid();
      getMockPolicy(code);return services.getRanking(actor,code,month(values.get("month")));
    }),
  };
}

/** モジュール読込時に認証状態やDB結果を捕捉しない。全依存は要求ごとに解決する。 */
export function createProductionMockHandlers(){
  const database=async()=>(await import("../prisma")).prisma;
  return createMockHandlers({
    getUser:async()=>{
      const user=await (await import("../auth")).getCurrentUser();
      return user?{id:user.id,roleName:user.role.name,status:user.status,deletedAt:user.deletedAt}:null;
    },
    services:{
      getMockList:async(actor,month)=>(await import("./read")).getMockList(await database(),actor,month),
      startMockAttempt:async(actor,input)=>(await import("./start")).startMockAttempt(await database(),actor,input),
      getMockAttempt:async(actor,id)=>(await import("./read")).getMockAttempt(await database(),actor,id),
      saveMockAnswer:async(actor,input)=>(await import("./answers")).saveMockAnswer(await database(),actor,input),
      submitMockAttempt:async(actor,input)=>(await import("./submit")).submitMockAttempt(await database(),actor,input),
      getMockResult:async(actor,id)=>(await import("./read")).getMockResult(await database(),actor,id),
      getRanking:async(actor,code,month)=>(await import("./ranking")).getMockRanking(await database(),actor,code,month),
    },
  });
}
