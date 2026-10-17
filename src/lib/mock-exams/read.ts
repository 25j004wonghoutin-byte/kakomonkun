import type { Prisma } from "../../../prisma/generated/client";
import { MockError, type AttemptView, type MockQuestionView, type ResultView } from "./contract";

const frozenSelect={
  id:true,orderNo:true,questionText:true,imagePath:true,sourceLabel:true,explanation:true,
  choices:{orderBy:{sortOrder:"asc"},select:{id:true,choiceLabel:true,choiceText:true,sortOrder:true,isCorrect:true}},
} satisfies Prisma.MockExamQuestionSelect;
type FrozenQuestion=Prisma.MockExamQuestionGetPayload<{select:typeof frozenSelect}>;

const publicQuestion=(q:FrozenQuestion):MockQuestionView=>({
  id:q.id,orderNo:q.orderNo,questionText:q.questionText,imagePath:q.imagePath,sourceLabel:q.sourceLabel,
  choices:q.choices.map(c=>({id:c.id,label:c.choiceLabel,text:c.choiceText,orderNo:c.sortOrder})),
});

/** 内部専用。呼出元で認証・所有者確認と必要な採点/ロックを済ませる。 */
export async function toMockAttemptView(tx:Prisma.TransactionClient,attemptId:string,now:Date):Promise<AttemptView>{
  const a=await tx.mockAttempt.findUnique({where:{id:attemptId}});
  if(!a)throw new MockError("attempt_not_found",404,"受験が見つかりません。");
  if(a.status!=="in_progress")throw new MockError("already_submitted",409,"この受験は提出済みです。");
  const questions=await tx.mockExamQuestion.findMany({where:{mockExamId:a.mockExamId},orderBy:{orderNo:"asc"},select:frozenSelect});
  const answers=await tx.mockAnswer.findMany({where:{attemptId},select:{mockQuestionId:true,selectedChoiceId:true,revision:true}});
  const saved=new Map(answers.map(answer=>[answer.mockQuestionId,answer]));
  return {
    id:a.id,mockExamId:a.mockExamId,attemptNo:a.attemptNo as 1|2,status:"in_progress",
    startedAt:a.startedAt.toISOString(),expiresAt:a.expiresAt.toISOString(),serverNow:now.toISOString(),revision:a.revision,
    questions:questions.map(publicQuestion),
    answers:questions.map(q=>saved.get(q.id)??{mockQuestionId:q.id,selectedChoiceId:null,revision:0}),
  };
}

/** 締切前は正解・正誤・解説をオブジェクト自体に含めない。 */
export async function toMockResultView(tx:Prisma.TransactionClient,attemptId:string,now:Date):Promise<ResultView>{
  const a=await tx.mockAttempt.findUnique({where:{id:attemptId}});
  if(!a)throw new MockError("attempt_not_found",404,"受験結果が見つかりません。");
  if(a.status!=="submitted"||!a.submittedAt)throw new MockError("not_submitted",409,"まだ提出されていません。");
  const exam=await tx.mockExam.findUniqueOrThrow({where:{id:a.mockExamId},select:{availableUntil:true}});
  const best=await tx.mockAttempt.findFirstOrThrow({where:{mockExamId:a.mockExamId,userId:a.userId,status:"submitted"},orderBy:[{correctCount:"desc"},{attemptNo:"asc"}],select:{id:true,score:true}});
  let review:ResultView["review"]=null;
  if(+now>=+exam.availableUntil){
    const questions=await tx.mockExamQuestion.findMany({where:{mockExamId:a.mockExamId},orderBy:{orderNo:"asc"},select:frozenSelect});
    const answers=await tx.mockAnswer.findMany({where:{attemptId},select:{mockQuestionId:true,selectedChoiceId:true,isCorrect:true}});
    const saved=new Map(answers.map(answer=>[answer.mockQuestionId,answer]));
    review=questions.map(q=>{
      const correct=q.choices.filter(c=>c.isCorrect);
      if(correct.length!==1)throw new MockError("invalid_snapshot",503,"固定された出題情報を確認してください。");
      const answer=saved.get(q.id);
      return {...publicQuestion(q),selectedChoiceId:answer?.selectedChoiceId??null,correctChoiceId:correct[0].id,
        isCorrect:answer?.isCorrect===true,explanation:q.explanation?.trim()?q.explanation:"解説は未登録です"};
    });
  }
  return {attemptId:a.id,mockExamId:a.mockExamId,attemptNo:a.attemptNo as 1|2,
    answeredCount:a.answeredCount,correctCount:a.correctCount,totalQuestions:a.totalQuestions,score:Number(a.score),
    earnedPoints:a.earnedPoints,bestAttemptId:best.id,bestScore:Number(best.score),
    submittedAt:a.submittedAt.toISOString(),reviewAvailableAt:exam.availableUntil.toISOString(),review};
}
