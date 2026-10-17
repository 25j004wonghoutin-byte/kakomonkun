import type { PrismaClient } from "../../../prisma/generated/client";
import { MockError, type MockClock } from "./contract";
import { readMockEnvironment } from "./environment";
import { dbNow } from "./locks";
import { syncTitleUnlocks } from "../titles/unlocks";
import { getTokyoDate } from "../tokyo-date";

/** 確定行を一意な報酬根拠とし、1人分の残高・資格・通知・進捗を同時に確定する。 */
export async function rewardMockRanking(db:PrismaClient,rankingId:string,clock:MockClock=dbNow):Promise<{rewardPoints:number;alreadyProcessed:boolean}>{
  if(!readMockEnvironment(process.env).enabled)throw new MockError("mock_disabled",503,"模擬試験は現在準備中です。");
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(rankingId))throw new MockError("invalid_ranking",400,"順位IDが正しくありません。");
  const before=await db.monthlyRanking.findUnique({where:{id:rankingId},select:{mockExamId:true,userId:true}});
  if(!before)throw new MockError("ranking_not_found",404,"確定順位が見つかりません。");
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM public.mock_exams WHERE id=${before.mockExamId}::uuid FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM public.users WHERE id=${before.userId}::uuid FOR NO KEY UPDATE`;
    const profile=await tx.$queryRaw<{user_id:string}[]>`SELECT user_id FROM public.student_profiles WHERE user_id=${before.userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM public.monthly_rankings WHERE id=${rankingId}::uuid FOR UPDATE`;
    const ranking=await tx.monthlyRanking.findUniqueOrThrow({where:{id:rankingId}});
    const exam=await tx.mockExam.findUniqueOrThrow({where:{id:ranking.mockExamId},select:{rankingFinalizedAt:true,availableUntil:true}});
    const now=await clock(tx);
    if(!Number.isFinite(+now))throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
    if(!ranking.isFinal||!exam.rankingFinalizedAt||+now<+exam.availableUntil)throw new MockError("ranking_not_final",409,"順位はまだ確定していません。");
    if(ranking.rewardProcessedAt)return {rewardPoints:ranking.rewardPoints,alreadyProcessed:true};
    if(profile.length!==1)throw new MockError("profile_unavailable",503,"学生プロフィールを確認してください。");
    const rewardPoints=ranking.rankNo===1?150:ranking.rankNo===2?100:ranking.rankNo===3?75:0;
    if(rewardPoints>0){
      const inserted=await tx.pointTransaction.createMany({data:[{userId:ranking.userId,points:rewardPoints,reason:"mock_rank_reward",sourceType:"monthly_ranking",sourceId:ranking.id,
        transactionDate:new Date(`${getTokyoDate(now)}T00:00:00Z`),description:"月次模擬試験の順位報酬"}],skipDuplicates:true});
      if(inserted.count===1)await tx.studentProfile.update({where:{userId:ranking.userId},data:{totalPoints:{increment:rewardPoints}}});
    }
    await syncTitleUnlocks(tx,ranking.userId,{now,source:"event"});
    await tx.monthlyRanking.update({where:{id:ranking.id},data:{rewardPoints,rewardProcessedAt:now}});
    return {rewardPoints,alreadyProcessed:false};
  },{maxWait:10000,timeout:30000});
}
