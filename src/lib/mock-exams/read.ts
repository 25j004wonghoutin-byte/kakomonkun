import type { Prisma, PrismaClient } from "../../../prisma/generated/client";
import { MockError, type AttemptView, type ExamCode, type MockActor, type MockClock, type MockListView, type MockQuestionView, type ResultView, type StartResult } from "./contract";
import { readMockEnvironment } from "./environment";
import { assertMockStudent, dbNow, lockMockAttempt } from "./locks";
import { getMockPolicy, getMockSchedule } from "./schedule";
import { gradeLockedAttempt } from "./submit";

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

function requireMockRead(actor:MockActor):void{
  assertMockStudent(actor);
  if(!readMockEnvironment(process.env).enabled)throw new MockError("mock_disabled",503,"模擬試験は現在準備中です。");
}

async function requireCurrentStudent(tx:Prisma.TransactionClient,actor:MockActor):Promise<void>{
  const user=await tx.user.findUnique({where:{id:actor.id},select:{status:true,deletedAt:true,role:{select:{name:true}}}});
  if(!user)throw new MockError("student_required",403,"有効な学生アカウントで利用してください。");
  assertMockStudent({id:actor.id,status:user.status,deletedAt:user.deletedAt,roleName:user.role.name});
}

/** GETでも期限整合だけは行う。新しい受験・試験・ジョブは作成しない。 */
export async function getMockAttempt(db:PrismaClient,actor:MockActor,attemptId:string,clock:MockClock=dbNow):Promise<StartResult>{
  requireMockRead(actor);
  return db.$transaction(async tx=>{
    const a=await lockMockAttempt(tx,actor,attemptId);
    const now=await clock(tx);
    if(!Number.isFinite(+now))throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
    if(a.status==="submitted"||+now>=+a.expiresAt){
      await gradeLockedAttempt(tx,a.id,now);
      return {kind:"result",result:await toMockResultView(tx,a.id,now)};
    }
    return {kind:"attempt",attempt:await toMockAttemptView(tx,a.id,now)};
  },{maxWait:10000,timeout:30000});
}

export async function getMockResult(db:PrismaClient,actor:MockActor,attemptId:string,clock:MockClock=dbNow):Promise<ResultView>{
  const view=await getMockAttempt(db,actor,attemptId,clock);
  if(view.kind!=="result")throw new MockError("not_submitted",409,"まだ提出されていません。");
  return view.result;
}

export async function getMockList(db:PrismaClient,actor:MockActor,month:string,clock:MockClock=dbNow):Promise<MockListView>{
  requireMockRead(actor);
  const schedule=getMockSchedule(month);
  const targetMonth=new Date(`${month}-01T00:00:00Z`);
  // 複数試験を同じ変更TXに載せず、試験→userの順序を試験ごとに守る。
  const pending=await db.$transaction(async tx=>{
    await requireCurrentStudent(tx,actor);
    const now=await clock(tx);
    return tx.mockAttempt.findMany({where:{userId:actor.id,status:"in_progress",expiresAt:{lte:now},mockExam:{targetMonth}},select:{id:true}});
  },{maxWait:10000,timeout:30000});
  for(const a of pending)await getMockAttempt(db,actor,a.id,clock);
  return db.$transaction(async tx=>{
    await requireCurrentStudent(tx,actor);
    const now=await clock(tx);
    if(!Number.isFinite(+now))throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
    const exams=await tx.mockExam.findMany({where:{targetMonth},select:{id:true,status:true,exam:{select:{code:true}}}});
    const own=await tx.mockAttempt.findMany({where:{userId:actor.id,mockExam:{targetMonth}},orderBy:{attemptNo:"asc"},select:{id:true,mockExamId:true,status:true}});
    const history=await tx.mockAttempt.findMany({where:{userId:actor.id},select:{mockExam:{select:{targetMonth:true}}}});
    const cards:MockListView["exams"]=[];
    for(const code of ["it_passport","fe"] as ExamCode[]){
      const policy=getMockPolicy(code),exam=exams.find(e=>e.exam.code===code);
      const attempts=own.filter(a=>a.mockExamId===exam?.id);
      const results:ResultView[]=[];
      for(const a of attempts)if(a.status==="submitted")results.push(await toMockResultView(tx,a.id,now));
      cards.push({id:exam?.id??null,examCode:code,title:code==="fe"?"基本情報技術者（科目A）":"ITパスポート",
        questionCount:policy.questionCount,timeLimitMinutes:policy.timeLimitMinutes,
        opensAt:schedule.opensAt.toISOString(),closesAt:schedule.closesAt.toISOString(),
        state:+now>=+schedule.closesAt?"closed":+now<+schedule.opensAt?"upcoming":exam?.status==="ready"?"open":"preparing",
        remainingAttempts:Math.max(0,policy.maxAttempts-attempts.length),activeAttemptId:attempts.find(a=>a.status==="in_progress")?.id??null,results});
    }
    return {month,historyMonths:[...new Set(history.map(a=>a.mockExam.targetMonth.toISOString().slice(0,7)))].sort().reverse(),exams:cards};
  },{isolationLevel:"RepeatableRead",maxWait:10000,timeout:30000});
}
