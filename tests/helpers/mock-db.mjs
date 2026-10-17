import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../prisma/generated/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadTestConfig } from "../../scripts/test-environment.mjs";
import { getMockPolicy, getMockSchedule } from "../../src/lib/mock-exams/schedule.ts";

/** 専用テストDBの自作UUIDだけを削除する。既存の試験/月は借用しない。 */
export async function withMockDb({examCode,month,userCount=2,prepared=true}, run) {
  const config=loadTestConfig();
  const policy=getMockPolicy(examCode), schedule=getMockSchedule(month);
  const clients=[0,1].map(()=>new PrismaClient({adapter:new PrismaPg({
    connectionString:config.DIRECT_URL,ssl:{rejectUnauthorized:false},max:1,
    connectionTimeoutMillis:10000,idleTimeoutMillis:1000,allowExitOnIdle:true,
  }),errorFormat:"minimal"}));
  const [db,other]=clients;
  const runId=randomUUID(),userIds=[],sourceIds=[],examIds=new Set();
  let now=new Date(`${month}-02T12:00:00+09:00`);
  const beforeEnv=new Map();
  const setEnv=(name,value)=>{beforeEnv.set(name,process.env[name]);process.env[name]=value;};
  const mockExamId=randomUUID();
  const initialExamIds=new Set();
  try {
    const exam=await db.exam.findUniqueOrThrow({where:{code:examCode}});
    const role=await db.role.findUniqueOrThrow({where:{name:"student"}});
    const category=await db.questionCategory.findUniqueOrThrow({where:{code:"technology"}});
    if(await db.mockExam.count({where:{examId:exam.id,targetMonth:new Date(`${month}-01`)}}))throw new Error("Mock fixture refuses an existing exam/month");
    for(const row of await db.mockExam.findMany({select:{id:true}}))initialExamIds.add(row.id);
    const actors=[];
    for(let i=0;i<userCount;i++){
      const id=randomUUID();userIds.push(id);
      await db.user.create({data:{id,email:`mock-qa-${runId}-${i}@example.invalid`,displayName:`模擬試験検証 ${i+1}`,roleId:role.id,createdAt:now,studentProfile:{create:{}}}});
      actors.push({id,roleName:"student",status:"active",deletedAt:null});
    }
    const questions=Array.from({length:policy.questionCount},(_,i)=>{
      const sourceQuestionId=randomUUID(),id=randomUUID();sourceIds.push(sourceQuestionId);
      return {id,mockExamId,sourceQuestionId,questionText:`検証問題 ${i+1}`,orderNo:i+1,
        sourceKey:`mock-qa:${runId}:${i}`,originalChoices:Array.from({length:4},(_,j)=>({id:randomUUID(),label:["ア","イ","ウ","エ"][j],text:`選択肢 ${j+1}`,sortOrder:j+1,isCorrect:j===0})),
        choices:Array.from({length:4},(_,j)=>({id:randomUUID(),label:["ア","イ","ウ","エ"][j],text:`選択肢 ${j+1}`,sortOrder:j+1,isCorrect:j===0})),
      };
    });
    for(const q of questions){q.correctChoiceId=q.choices[0].id;q.originalCorrectChoiceId=q.originalChoices[0].id;}
    await db.$transaction(async tx=>{
      await tx.question.createMany({data:questions.map(q=>({id:q.sourceQuestionId,sourceKey:q.sourceKey,examId:exam.id,categoryId:category.id,sourceYear:Number(month.slice(0,4)),sourceSeason:"QA",questionNo:q.orderNo,questionText:q.questionText,explanation:"検証用の解説"}))});
      await tx.questionChoice.createMany({data:questions.flatMap(q=>q.originalChoices.map(c=>({id:c.id,questionId:q.sourceQuestionId,choiceLabel:c.label,choiceText:c.text,isCorrect:c.isCorrect,sortOrder:c.sortOrder})))});
      if(prepared){
        await tx.mockExam.create({data:{id:mockExamId,examId:exam.id,title:`模擬試験検証 ${runId}`,targetMonth:new Date(`${month}-01`),timeLimitMinutes:policy.timeLimitMinutes,questionCount:policy.questionCount,status:"ready",availableFrom:schedule.opensAt,availableUntil:schedule.closesAt,createdBy:actors[0].id}});
        examIds.add(mockExamId);
        await tx.mockExamQuestion.createMany({data:questions.map(q=>({id:q.id,mockExamId,questionId:q.sourceQuestionId,orderNo:q.orderNo,questionText:q.questionText,categoryCode:"technology",sourceKey:q.sourceKey,sourceYear:Number(month.slice(0,4)),sourceSeason:"QA",questionNo:q.orderNo,sourceLabel:"検証用問題",explanation:"固定された検証用の解説"}))});
        await tx.mockExamChoice.createMany({data:questions.flatMap(q=>q.choices.map((c,i)=>({id:c.id,mockQuestionId:q.id,mockExamId,originalChoiceId:q.originalChoices[i].id,choiceLabel:c.label,choiceText:c.text,isCorrect:c.isCorrect,sortOrder:c.sortOrder})))});
      }
    },{timeout:30000});
    for(const [key,value] of Object.entries({DATABASE_URL:config.DATABASE_URL,DIRECT_URL:config.DIRECT_URL,NEXT_PUBLIC_SUPABASE_URL:config.NEXT_PUBLIC_SUPABASE_URL,KAKOMON_TEST_ENV:"1",KAKOMON_MOCK_ENABLED:"true",KAKOMON_MOCK_STARTS_ENABLED:"true",KAKOMON_MOCK_JOBS_ENABLED:"false",KAKOMON_MOCK_PROJECT_REF:config.TEST_SUPABASE_PROJECT_REF}))setEnv(key,value);
    return await run({db,other,runId,actor:actors[0],actors,mockExamId,examId:exam.id,questions,
      now:()=>new Date(now),setNow:value=>{if(!Number.isFinite(+value))throw new Error("Invalid fixture clock");now=new Date(value);},clock:async()=>new Date(now),
      trackExam:id=>{if(initialExamIds.has(id))throw new Error("Cannot own a pre-existing exam");examIds.add(id);},
    });
  } finally {
    for(const [key,value] of beforeEnv){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    try {
      await other.$disconnect();
      await db.$transaction(async tx=>{
        const ids=[...examIds];
        await tx.notification.deleteMany({where:{OR:[{recipientId:{in:userIds}},{actorId:{in:userIds}}]}});
        await tx.userTitleUnlock.deleteMany({where:{userId:{in:userIds}}});
        await tx.userTitle.deleteMany({where:{userId:{in:userIds}}});
        await tx.pointTransaction.deleteMany({where:{userId:{in:userIds}}});
        await tx.studentActivityDay.deleteMany({where:{userId:{in:userIds}}});
        await tx.studentNavigationProgress.deleteMany({where:{userId:{in:userIds}}});
        await tx.monthlyRanking.deleteMany({where:{OR:[{userId:{in:userIds}},{mockExamId:{in:ids}}]}});
        await tx.mockAnswer.deleteMany({where:{OR:[{attempt:{userId:{in:userIds}}},{mockExamId:{in:ids}}]}});
        await tx.mockAttempt.deleteMany({where:{OR:[{userId:{in:userIds}},{mockExamId:{in:ids}}]}});
        await tx.mockExamChoice.deleteMany({where:{mockExamId:{in:ids}}});
        await tx.mockExamQuestion.deleteMany({where:{mockExamId:{in:ids}}});
        await tx.mockExam.deleteMany({where:{id:{in:ids}}});
        await tx.question.deleteMany({where:{id:{in:sourceIds},sourceKey:{startsWith:`mock-qa:${runId}:`}}});
        await tx.user.deleteMany({where:{id:{in:userIds},email:{startsWith:`mock-qa-${runId}-`}}});
      },{timeout:30000});
    } finally {await db.$disconnect();}
  }
}
