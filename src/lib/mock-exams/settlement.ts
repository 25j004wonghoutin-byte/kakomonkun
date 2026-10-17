import type { Prisma, PrismaClient } from "../../../prisma/generated/client";
import { MockError, type MockClock } from "./contract";
import { readMockEnvironment } from "./environment";
import { dbNow } from "./locks";
import { rankBestAttempts, settleExpiredMockAttempts } from "./ranking";
import { rewardMockRanking } from "./rewards";

type SettlementResult={phase:"grading"|"ranked"|"complete";remaining:number};

async function lockedExam(tx:Prisma.TransactionClient,id:string,clock:MockClock){
  await tx.$queryRaw`SELECT id FROM public.mock_exams WHERE id=${id}::uuid FOR NO KEY UPDATE`;
  const exam=await tx.mockExam.findUnique({where:{id}}),now=await clock(tx);
  if(!exam)throw new MockError("exam_not_found",404,"模擬試験が見つかりません。");
  if(!Number.isFinite(+now))throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
  if(+now<+exam.availableUntil)throw new MockError("settlement_not_due",409,"締切前には順位を確定できません。");
  if(exam.status!=="ready")throw new MockError("exam_preparing",503,"公開用の試験情報を確認してください。");
  return {exam,now};
}

/** 1回につき採点最大25件、または報酬最大25人。確定順位は再作成しない。 */
export async function settleMockExamBatch(db:PrismaClient,mockExamId:string,clock:MockClock=dbNow):Promise<SettlementResult>{
  if(!readMockEnvironment(process.env).enabled)throw new MockError("mock_disabled",503,"模擬試験は現在準備中です。");
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(mockExamId))throw new MockError("invalid_exam",400,"試験IDが正しくありません。");
  const before=await db.$transaction(tx=>lockedExam(tx,mockExamId,clock),{maxWait:10000,timeout:30000});
  if(before.exam.rewardsCompletedAt)return {phase:"complete",remaining:0};
  if(!before.exam.rankingFinalizedAt){
    await settleExpiredMockAttempts(db,mockExamId,25,clock);
    const frozen=await db.$transaction(async tx=>{
      const {exam,now}=await lockedExam(tx,mockExamId,clock);
      if(exam.rankingFinalizedAt)return null;
      const remaining=await tx.mockAttempt.count({where:{mockExamId,status:"in_progress"}});
      if(remaining)return {phase:"grading" as const,remaining};
      if(await tx.monthlyRanking.count({where:{mockExamId}})>0)throw new MockError("invalid_ranking_state",503,"順位の保存状態を確認してください。");
      const attempts=await tx.mockAttempt.findMany({where:{mockExamId,status:"submitted"},select:{id:true,userId:true,attemptNo:true,correctCount:true,totalQuestions:true}});
      const ranked=rankBestAttempts(attempts.map(a=>({userId:a.userId,attemptId:a.id,attemptNo:a.attemptNo as 1|2,correctCount:a.correctCount,totalQuestions:a.totalQuestions})));
      if(ranked.length)await tx.monthlyRanking.createMany({data:ranked.map(row=>({mockExamId,targetMonth:exam.targetMonth,userId:row.userId,bestAttemptId:row.attemptId,
        rankNo:row.rankNo,mockScore:row.score,correctCount:row.correctCount,totalQuestions:row.totalQuestions,isFinal:true,calculatedAt:now}))});
      await tx.mockExam.update({where:{id:mockExamId},data:{rankingFinalizedAt:now,...(ranked.length?{}:{rewardsCompletedAt:now})}});
      return {phase:ranked.length?"ranked" as const:"complete" as const,remaining:ranked.length};
    },{maxWait:10000,timeout:30000});
    if(frozen)return frozen;
  }
  const pending=await db.monthlyRanking.findMany({where:{mockExamId,isFinal:true,rewardProcessedAt:null},orderBy:{userId:"asc"},take:25,select:{id:true}});
  for(const row of pending)await rewardMockRanking(db,row.id,clock);
  return db.$transaction(async tx=>{
    const {exam,now}=await lockedExam(tx,mockExamId,clock);
    const remaining=await tx.monthlyRanking.count({where:{mockExamId,isFinal:true,rewardProcessedAt:null}});
    if(remaining)return {phase:"ranked",remaining};
    if(!exam.rewardsCompletedAt)await tx.mockExam.update({where:{id:mockExamId},data:{rewardsCompletedAt:now}});
    return {phase:"complete",remaining:0};
  },{maxWait:10000,timeout:30000});
}
