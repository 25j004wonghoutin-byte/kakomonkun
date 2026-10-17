import type { PrismaClient } from "../../../prisma/generated/client";
import { MockError, type ExamCode, type MockActor, type MockClock, type StartInput, type StartResult } from "./contract";
import { readMockEnvironment } from "./environment";
import { assertMockStudent, dbNow, lockMockAttempt, lockMockExamOwner } from "./locks";
import { getAttemptDeadline, getMockPolicy, getMockSchedule } from "./schedule";
import { gradeLockedAttempt } from "./submit";
import { toMockAttemptView, toMockResultView } from "./read";

/** 開始/再開の全受理IDを保存し、後日の再送を新規受験へ変換しない。 */
export async function startMockAttempt(
  db:PrismaClient,actor:MockActor,input:StartInput,clock:MockClock=dbNow,
):Promise<StartResult>{
  assertMockStudent(actor);
  if(!readMockEnvironment(process.env).enabled)throw new MockError("mock_disabled",503,"模擬試験は現在準備中です。");
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.requestId))throw new MockError("invalid_request_id",400,"開始要求IDが正しくありません。");
  return db.$transaction(async tx=>{
    await lockMockExamOwner(tx,actor,input.mockExamId);
    const key={userId:actor.id,requestId:input.requestId};
    const replay=await tx.mockAttemptStartRequest.findUnique({where:{userId_requestId:key}});
    if(replay&&replay.mockExamId!==input.mockExamId)throw new MockError("start_request_conflict",409,"この開始要求は別の受験に使用されています。");
    const previous=replay
      ? await tx.mockAttempt.findUniqueOrThrow({where:{id:replay.attemptId}})
      : await tx.mockAttempt.findFirst({where:{mockExamId:input.mockExamId,userId:actor.id,status:"in_progress"}});
    if(previous){
      const a=await lockMockAttempt(tx,actor,previous.id);
      const now=await clock(tx);
      if(!Number.isFinite(+now))throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
      if(!replay)await tx.mockAttemptStartRequest.create({data:{...key,mockExamId:a.mockExamId,attemptId:a.id,createdAt:now}});
      if(a.status==="submitted"||+now>=+a.expiresAt){
        await gradeLockedAttempt(tx,a.id,now);
        return {kind:"result",result:await toMockResultView(tx,a.id,now)};
      }
      return {kind:"attempt",attempt:await toMockAttemptView(tx,a.id,now)};
    }
    // ロック待ち後の時計だけを、新しい受験の可否・期限へ使う。
    const now=await clock(tx);
    const exam=await tx.mockExam.findUniqueOrThrow({where:{id:input.mockExamId},include:{exam:{select:{code:true}}}});
    if(exam.status!=="ready")throw new MockError("exam_preparing",503,"模擬試験を準備しています。");
    const policy=getMockPolicy(exam.exam.code as ExamCode);
    const schedule=getMockSchedule(exam.targetMonth.toISOString().slice(0,7));
    const expiresAt=getAttemptDeadline(now,schedule,policy.timeLimitMinutes);
    if(!readMockEnvironment(process.env).startsEnabled)throw new MockError("starts_disabled",503,"新しい受験の開始を一時停止しています。");
    const previousCount=await tx.mockAttempt.count({where:{mockExamId:exam.id,userId:actor.id}});
    if(previousCount>=policy.maxAttempts)throw new MockError("attempt_limit",409,"この模擬試験は2回まで受験できます。");
    const questions=await tx.mockExamQuestion.findMany({where:{mockExamId:exam.id},orderBy:{orderNo:"asc"},select:{id:true}});
    if(exam.questionCount!==policy.questionCount||exam.timeLimitMinutes!==policy.timeLimitMinutes||questions.length!==policy.questionCount){
      throw new MockError("invalid_snapshot",503,"固定された出題数を確認してください。");
    }
    const a=await tx.mockAttempt.create({data:{mockExamId:exam.id,userId:actor.id,startRequestId:input.requestId,
      attemptNo:previousCount+1,startedAt:now,expiresAt,totalQuestions:policy.questionCount}});
    await tx.mockAnswer.createMany({data:questions.map(q=>({attemptId:a.id,mockExamId:exam.id,mockQuestionId:q.id}))});
    await tx.mockAttemptStartRequest.create({data:{...key,mockExamId:exam.id,attemptId:a.id,createdAt:now}});
    return {kind:"attempt",attempt:await toMockAttemptView(tx,a.id,now)};
  },{maxWait:10000,timeout:30000});
}
