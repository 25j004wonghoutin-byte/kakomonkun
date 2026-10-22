import type { Prisma, PrismaClient } from "../../../prisma/generated/client";
import { parseAvatarUrl } from "../avatars/contract";
import { MockError, type ExamCode, type MockActor, type MockClock, type RankedResult, type RankResult, type RankingStudentView, type RankingView } from "./contract";
import { readMockEnvironment } from "./environment";
import { scorePercent } from "./grading";
import { assertMockStudent, dbNow } from "./locks";
import { getMockPolicy, getMockSchedule } from "./schedule";
import { gradeLockedAttempt } from "./submit";
import { getTokyoDate } from "../tokyo-date";

export function rankBestAttempts(rows:readonly RankResult[]):RankedResult[]{
  const best=new Map<string,RankResult>();
  for(const row of rows){
    const old=best.get(row.userId);
    if(!old||row.correctCount>old.correctCount||(row.correctCount===old.correctCount&&row.attemptNo<old.attemptNo))best.set(row.userId,row);
  }
  const sorted=[...best.values()].sort((a,b)=>b.correctCount-a.correctCount||(a.userId<b.userId?-1:a.userId>b.userId?1:0));
  let rankNo=0;
  return sorted.map((row,i)=>{if(i===0||row.correctCount!==sorted[i-1].correctCount)rankNo=i+1;return {...row,rankNo,score:scorePercent(row.correctCount,row.totalQuestions)};});
}

async function authorize(tx:Prisma.TransactionClient,actor:MockActor):Promise<void>{
  const user=await tx.user.findUnique({where:{id:actor.id},select:{status:true,deletedAt:true,role:{select:{name:true}}}});
  if(!user)throw new MockError("student_required",403,"有効な学生アカウントで利用してください。");
  assertMockStudent({id:actor.id,status:user.status,deletedAt:user.deletedAt,roleName:user.role.name});
}

/** 公開済み試験内の期限切れ整合だけ。本人認証を迂回する受験変更APIではない。 */
export async function settleExpiredMockAttempts(db:PrismaClient,mockExamId:string,limit=25,clock:MockClock=dbNow,canContinue:()=>boolean=()=>true):Promise<number>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>25)throw new MockError("invalid_batch",400,"集計件数が正しくありません。");
  const due=await db.$transaction(async tx=>{
    const now=await clock(tx);
    return tx.mockAttempt.findMany({where:{mockExamId,status:"in_progress",expiresAt:{lte:now}},orderBy:[{expiresAt:"asc"},{id:"asc"}],take:limit,select:{id:true,userId:true}});
  },{maxWait:10000,timeout:30000});
  let count=0;
  for(const row of due){
    if(!canContinue())break;
    await db.$transaction(async tx=>{
    // 利用停止後も受理済み受験の記録を消さず、DB期限でだけ整合する。
    await tx.$queryRaw`SELECT id FROM public.mock_exams WHERE id=${mockExamId}::uuid FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM public.users WHERE id=${row.userId}::uuid FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT user_id FROM public.student_profiles WHERE user_id=${row.userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM public.mock_attempts WHERE id=${row.id}::uuid FOR UPDATE`;
    const a=await tx.mockAttempt.findUnique({where:{id:row.id}}),now=await clock(tx);
    if(a&&a.mockExamId===mockExamId&&a.status==="in_progress"&&+now>=+a.expiresAt){await gradeLockedAttempt(tx,a.id,now);count++;}
  },{maxWait:10000,timeout:30000});
  }
  return count;
}

export async function getMockRanking(db:PrismaClient,actor:MockActor,examCode:ExamCode,month:string,clock:MockClock=dbNow):Promise<RankingView>{
  assertMockStudent(actor);getMockPolicy(examCode);const schedule=getMockSchedule(month);
  if(!readMockEnvironment(process.env).enabled)throw new MockError("mock_disabled",503,"模擬試験は現在準備中です。");
  const targetMonth=new Date(`${month}-01T00:00:00Z`);
  const found=await db.$transaction(async tx=>{await authorize(tx,actor);return tx.mockExam.findFirst({where:{targetMonth,exam:{code:examCode},status:"ready"},select:{id:true,rankingFinalizedAt:true}});},{maxWait:10000,timeout:30000});
  if(found&&!found.rankingFinalizedAt)await settleExpiredMockAttempts(db,found.id,25,clock);
  return db.$transaction(async tx=>{
    await authorize(tx,actor);const now=await clock(tx);
    if(!Number.isFinite(+now))throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
    const exam=found?await tx.mockExam.findUniqueOrThrow({where:{id:found.id},select:{id:true,rankingFinalizedAt:true,rewardsCompletedAt:true}}):null;
    const currentMonth=new Date(`${getTokyoDate(now).slice(0,7)}-01T00:00:00Z`);
    const available=await tx.mockExam.findMany({where:{exam:{code:examCode},status:"ready",targetMonth:{lte:currentMonth}},select:{targetMonth:true}});
    const availableMonths=[...new Set([month,...available.map(row=>row.targetMonth.toISOString().slice(0,7))])].sort().reverse();
    let ranked:RankedResult[]=[],settling=false;
    if(exam?.rankingFinalizedAt){
      const saved=await tx.monthlyRanking.findMany({where:{mockExamId:exam.id,isFinal:true},orderBy:[{rankNo:"asc"},{userId:"asc"}],select:{userId:true,bestAttemptId:true,rankNo:true,mockScore:true,correctCount:true,totalQuestions:true,bestAttempt:{select:{attemptNo:true}}}});
      ranked=saved.map(row=>({userId:row.userId,attemptId:row.bestAttemptId,attemptNo:row.bestAttempt.attemptNo as 1|2,rankNo:row.rankNo,score:Number(row.mockScore),correctCount:row.correctCount,totalQuestions:row.totalQuestions}));
    }else if(exam){
      const rows=await tx.mockAttempt.findMany({where:{mockExamId:exam.id,status:"submitted"},select:{id:true,userId:true,attemptNo:true,correctCount:true,totalQuestions:true}});
      ranked=rankBestAttempts(rows.map(row=>({userId:row.userId,attemptId:row.id,attemptNo:row.attemptNo as 1|2,correctCount:row.correctCount,totalQuestions:row.totalQuestions})));
      settling=+now>=+schedule.closesAt||await tx.mockAttempt.count({where:{mockExamId:exam.id,status:"in_progress",expiresAt:{lte:now}}})>0;
    }
    const visible=ranked.filter(row=>row.rankNo<=3||row.userId===actor.id);
    const users=await tx.user.findMany({where:{id:{in:visible.map(row=>row.userId)}},select:{id:true,displayName:true,status:true,deletedAt:true,role:{select:{name:true}},studentProfile:{select:{avatarUrl:true,currentTitle:{select:{name:true}}}}}});
    const profiles=new Map(users.map(user=>[user.id,user]));
    const view=(row:RankedResult):RankingStudentView=>{
      const user=profiles.get(row.userId),active=user?.status==="active"&&!user.deletedAt&&user.role.name==="student";
      const avatar=active?parseAvatarUrl(user.studentProfile?.avatarUrl):null;
      return {userId:row.userId,rankNo:row.rankNo,score:row.score,
        displayName:user?.deletedAt?"退会した学生":user?.displayName.trim()||"学生",
        avatarUrl:avatar?.userId===row.userId?avatar.url:null,currentTitleName:active?user.studentProfile?.currentTitle?.name??null:null,
        profileHref:active?`/board/users/${row.userId}`:null};
    };
    const mine=ranked.find(row=>row.userId===actor.id);
    return {examCode,month,currentMonth:currentMonth.toISOString().slice(0,7),availableMonths,participantCount:ranked.length,state:exam?.rankingFinalizedAt?"final":settling?"settling":"provisional",
      top:ranked.filter(row=>row.rankNo<=3).map(view),mine:mine?view(mine):null,rewardsComplete:exam?.rewardsCompletedAt!==null&&exam?.rewardsCompletedAt!==undefined};
  },{isolationLevel:"RepeatableRead",maxWait:10000,timeout:30000});
}
