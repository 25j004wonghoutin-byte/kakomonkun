import type { PrismaClient } from "../../../prisma/generated/client";
import { MockError, type MockActor, type MockClock, type SaveInput, type SaveResult } from "./contract";
import { dbNow, lockMockAttempt } from "./locks";
import { gradeLockedAttempt } from "./submit";
import { toMockResultView } from "./read";
import { recordTitleAnswer } from "../titles/learning-events";

const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** 問題単位CAS。未提出の保存では正誤も累計回答数も確定しない。 */
export async function saveMockAnswer(
  db:PrismaClient,actor:MockActor,input:SaveInput,clock:MockClock=dbNow,
):Promise<SaveResult>{
  if(!uuid.test(input.mockQuestionId)||!uuid.test(input.requestId)
    ||(input.selectedChoiceId!==null&&!uuid.test(input.selectedChoiceId))
    ||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0){
    throw new MockError("invalid_answer",400,"回答の指定が正しくありません。");
  }
  return db.$transaction(async(tx):Promise<SaveResult>=>{
    const a=await lockMockAttempt(tx,actor,input.attemptId),now=await clock(tx);
    if(!Number.isFinite(+now))throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
    if(a.status==="submitted"||+now>=+a.expiresAt){
      await gradeLockedAttempt(tx,a.id,now);
      return {kind:"submitted",result:await toMockResultView(tx,a.id,now)};
    }
    const question=await tx.mockExamQuestion.findUnique({where:{id:input.mockQuestionId},select:{mockExamId:true}});
    if(question?.mockExamId!==a.mockExamId)throw new MockError("invalid_question",400,"この受験の出題問題ではありません。");
    if(input.selectedChoiceId!==null){
      const choice=await tx.mockExamChoice.findUnique({where:{id:input.selectedChoiceId},select:{mockExamId:true,mockQuestionId:true}});
      if(choice?.mockExamId!==a.mockExamId||choice.mockQuestionId!==input.mockQuestionId)throw new MockError("invalid_choice",400,"この問題の選択肢を指定してください。");
    }
    const answer=await tx.mockAnswer.findUnique({where:{attemptId_mockQuestionId:{attemptId:a.id,mockQuestionId:input.mockQuestionId}},
      select:{id:true,mockQuestionId:true,selectedChoiceId:true,revision:true,lastRequestId:true}});
    if(!answer)throw new MockError("answer_unavailable",503,"回答欄の情報を確認してください。");
    const saved=(revision=answer.revision,attemptRevision=a.revision):SaveResult=>({kind:"saved",
      answer:{mockQuestionId:input.mockQuestionId,selectedChoiceId:input.selectedChoiceId,revision},attemptRevision,serverNow:now.toISOString()});
    if(answer.lastRequestId===input.requestId){
      if(answer.selectedChoiceId!==input.selectedChoiceId||answer.revision!==input.expectedRevision+1){
        throw new MockError("save_request_conflict",409,"同じ保存要求に異なる内容が指定されています。最新状態を確認してください。");
      }
      return saved();
    }
    if(answer.revision!==input.expectedRevision)throw new MockError("stale_answer",409,"別の画面で回答が更新されています。最新状態を確認してください。");
    if(answer.selectedChoiceId===input.selectedChoiceId)return saved();
    const updated=await tx.mockAnswer.updateMany({where:{id:answer.id,revision:input.expectedRevision},data:{
      selectedChoiceId:input.selectedChoiceId,answeredAt:input.selectedChoiceId===null?null:now,
      revision:{increment:1},lastRequestId:input.requestId,
    }});
    if(updated.count!==1)throw new MockError("stale_answer",409,"回答が更新されています。最新状態を確認してください。");
    const attempt=await tx.mockAttempt.update({where:{id:a.id},data:{revision:{increment:1}},select:{revision:true}});
    // 解除・同じ値・再送だけで、回答した日や利用時刻を作らない。
    if(input.selectedChoiceId!==null)await recordTitleAnswer(tx,actor.id,now);
    return saved(answer.revision+1,attempt.revision);
  },{maxWait:10000,timeout:30000});
}
