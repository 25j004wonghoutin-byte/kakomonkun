import { randomInt, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../prisma/generated/client";
import { MockError, type ExamCode, type MonthKey, type MockClock } from "./contract";
import { getMockPolicy, getMockSchedule } from "./schedule";
import { mockPoolSelect, isEligibleMockQuestion, selectMockQuestions } from "./question-pool";
import manifest from "./question-assets.json" with { type: "json" };

const assets: ReadonlySet<string>=new Set(Object.keys(manifest.assets));

export async function prepareMockExam(
  db: PrismaClient, input: { examCode: ExamCode; month: MonthKey },
  clock: MockClock=async tx=>(await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`)[0].now,
): Promise<{mockExamId:string;created:boolean}> {
  const policy=getMockPolicy(input.examCode),schedule=getMockSchedule(input.month);
  const targetMonth=new Date(`${input.month}-01`);
  // ロック取得SELECT自体がsnapshotを取るため、待機側のserialization conflictは新規TXで再試行する。
  for(let retry=0;;retry++){
    try{
      return await db.$transaction(async tx=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mock-prepare:${input.examCode}:${input.month}`}))`;
        const exam=await tx.exam.findUnique({where:{code:input.examCode},select:{id:true,name:true,isActive:true}});
        if(!exam?.isActive)throw new MockError("exam_unavailable",503,"対象試験は現在利用できません。");
        const existing=await tx.mockExam.findUnique({where:{examId_targetMonth:{examId:exam.id,targetMonth}}});
        if(existing){
          if(existing.status!=="ready")throw new MockError("exam_preparing",503,"模擬試験を準備しています。");
          return {mockExamId:existing.id,created:false};
        }
        const pool=await tx.question.findMany({where:{examId:exam.id,status:"published",deletedAt:null,sourceYear:{not:null}},orderBy:{id:"asc"},select:mockPoolSelect});
        const selected=selectMockQuestions(pool.filter(q=>isEligibleMockQuestion(q,assets)),policy.questionCount,randomInt);
        const mockExamId=randomUUID();
        await tx.mockExam.create({data:{id:mockExamId,examId:exam.id,targetMonth,
          title:`${input.month} ${exam.name} 模擬試験`,status:"draft",questionCount:policy.questionCount,
          timeLimitMinutes:policy.timeLimitMinutes,availableFrom:schedule.opensAt,availableUntil:schedule.closesAt,
        }});
        const now=await clock(tx);
        if(!Number.isFinite(+now))throw new MockError("invalid_clock",503,"サーバー時刻を確認できません。");
        const frozen=selected.map((q,i)=>({id:randomUUID(),mockExamId,questionId:q.id,orderNo:i+1,score:1,
          questionText:q.questionText,imagePath:q.imagePath,explanation:q.explanation,categoryCode:q.category.code,
          sourceKey:q.sourceKey,sourceYear:q.sourceYear!,sourceSeason:q.sourceSeason,questionNo:q.questionNo,
          sourceLabel:`${q.sourceYear}${q.sourceSeason?` ${q.sourceSeason}`:""}${q.questionNo===null?"":` 問${q.questionNo}`}`,
        }));
        await tx.mockExamQuestion.createMany({data:frozen});
        await tx.mockExamChoice.createMany({data:selected.flatMap((q,i)=>q.choices.map(c=>({id:randomUUID(),
          mockExamId,mockQuestionId:frozen[i].id,originalChoiceId:c.id,
          choiceLabel:c.choiceLabel,choiceText:c.choiceText,isCorrect:c.isCorrect,sortOrder:c.sortOrder,
        })))});
        await tx.mockExam.update({where:{id:mockExamId},data:{status:"ready",createdAt:now,updatedAt:now}});
        return {mockExamId,created:true};
      },{isolationLevel:"Serializable",maxWait:10000,timeout:30000});
    }catch(error){
      if(retry<3&&error!==null&&typeof error==="object"&&"code" in error&&["P2034","P2002"].includes(String(error.code)))continue;
      throw error;
    }
  }
}
