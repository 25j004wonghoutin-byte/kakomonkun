import type { Prisma, PrismaClient } from "../../../prisma/generated/client";
import { MockError, type MockActor, type MockClock, type ResultView, type SubmitInput } from "./contract";
import { scorePercent } from "./grading";
import { dbNow, lockMockAttempt } from "./locks";
import { toMockResultView } from "./read";
import { getTokyoDate } from "../tokyo-date";

/** 呼出元が試験/所有者/profile/受験のロックを持つ、唯一の採点処理。 */
export async function gradeLockedAttempt(tx:Prisma.TransactionClient,attemptId:string,now:Date):Promise<void>{
  const a=await tx.mockAttempt.findUniqueOrThrow({where:{id:attemptId}});
  if(a.status==="submitted")return;
  if(!Number.isFinite(+now)||+now<+a.startedAt)throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
  const exam=await tx.mockExam.findUniqueOrThrow({where:{id:a.mockExamId},select:{questionCount:true}});
  if(a.totalQuestions!==exam.questionCount||await tx.mockExamQuestion.count({where:{mockExamId:a.mockExamId}})!==exam.questionCount){
    throw new MockError("invalid_snapshot",503,"固定された出題数を確認してください。");
  }
  const answers=await tx.mockAnswer.findMany({where:{attemptId},select:{id:true,selectedChoiceId:true,selectedChoice:{select:{isCorrect:true}}}});
  const answeredCount=answers.filter(answer=>answer.selectedChoiceId!==null).length;
  const correctIds=answers.filter(answer=>answer.selectedChoice?.isCorrect===true).map(answer=>answer.id);
  const submittedAt=new Date(Math.min(+now,+a.expiresAt));
  await tx.mockAnswer.updateMany({where:{attemptId},data:{isCorrect:false,scoreAwarded:0}});
  if(correctIds.length)await tx.mockAnswer.updateMany({where:{id:{in:correctIds}},data:{isCorrect:true,scoreAwarded:1}});
  const reward=await tx.pointTransaction.createMany({data:[{
    userId:a.userId,points:20,reason:"mock_participation",sourceType:"mock_exam",sourceId:a.mockExamId,
    transactionDate:new Date(`${getTokyoDate(submittedAt)}T00:00:00Z`),description:"模擬試験の初回提出報酬",
  }],skipDuplicates:true});
  const earnedPoints=reward.count===1?20:0;
  await tx.studentProfile.update({where:{userId:a.userId},data:{
    totalPoints:{increment:earnedPoints},totalAnswerCount:{increment:answeredCount},totalCorrectCount:{increment:correctIds.length},
  }});
  await tx.mockAttempt.update({where:{id:attemptId},data:{status:"submitted",submittedAt,gradedAt:now,
    answeredCount,correctCount:correctIds.length,score:scorePercent(correctIds.length,exam.questionCount),earnedPoints,revision:{increment:1}}});
}

export async function submitMockAttempt(db:PrismaClient,actor:MockActor,input:SubmitInput,clock:MockClock=dbNow):Promise<ResultView>{
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw new MockError("invalid_revision",400,"回答の更新番号が正しくありません。");
  return db.$transaction(async tx=>{
    const a=await lockMockAttempt(tx,actor,input.attemptId);
    const now=await clock(tx);
    if(a.status!=="submitted"&&+now<+a.expiresAt&&a.revision!==input.expectedRevision){
      throw new MockError("stale_attempt",409,"回答が更新されています。最新の状態を確認してください。");
    }
    await gradeLockedAttempt(tx,a.id,now);
    return toMockResultView(tx,a.id,now);
  },{maxWait:10000,timeout:30000});
}
