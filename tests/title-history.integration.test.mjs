import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { getMockPolicy, getMockSchedule } from "../src/lib/mock-exams/schedule.ts";
import { withMockDb } from "./helpers/mock-db.mjs";
import { collectTitleFacts } from "../src/lib/titles/facts.ts";
import { collectTitleFacts as referenceFacts } from "./helpers/title-facts-reference.mjs";

// The reference was captured before optimization; PostgreSQL validates the real joins and filters.
test("one-read title history matches the previous collector on real isolated data", {
 skip:process.env.KAKOMON_RUN_DB_QA!=="1", timeout:180000,
},async t=>{
 await withMockDb({examCode:"it_passport",month:"2095-12",userCount:2},async f=>{
  const {db,actor,actors}=f, userId=actor.id, now=new Date("2026-10-28T06:00:00Z");
  const normalize=facts=>({...facts,ownedKeys:[...facts.ownedKeys].sort()});
  async function compare(tx,label){
   for(const enabled of [false,true])assert.deepEqual(normalize(await collectTitleFacts(tx,userId,now,{mockExamsEnabled:enabled})),normalize(await referenceFacts(tx,userId,now,{mockExamsEnabled:enabled})),`${label}; mock=${enabled}`);
  }
  let postId;
  try{
   await compare(db,"empty");
   const qs=await db.question.findMany({where:{examId:f.examId,status:"published",deletedAt:null,sourceKey:{not:{startsWith:"mock-qa:"}}},orderBy:{id:"asc"},take:60,include:{choices:{orderBy:{sortOrder:"asc"}}}});assert.equal(qs.length,60);
   await db.studentProfile.update({where:{userId},data:{titleTrackingStartedAt:new Date("2026-09-01T00:00:00Z"),totalAnswerCount:99999}});
   for(const [index,definition] of [{count:60,answered:60,correct:0,status:"completed"},{count:30,answered:30,correct:30,status:"completed"},{count:60,answered:1,correct:1,status:"completed"},{count:30,answered:2,correct:1,status:"in_progress"}].entries()){
    const session=await db.practiceSession.create({data:{userId,examId:f.examId,status:definition.status,questionCount:definition.count,answeredCount:definition.answered,correctCount:definition.correct,completedAt:definition.status==="completed"?new Date(`2026-09-${20+index}T12:00:00Z`):null}});
    await db.practiceAnswer.createMany({data:qs.slice(0,definition.answered).map((q,i)=>{const isCorrect=i<definition.correct;return {sessionId:session.id,questionId:q.id,selectedChoiceId:q.choices.find(c=>c.isCorrect===isCorrect).id,isCorrect,orderNo:i+1,answeredAt:new Date("2026-10-01T15:00:00Z")};})});
   }
   await db.dailyQaAnswer.createMany({data:qs.slice(0,3).map((q,i)=>({userId,questionId:q.id,selectedChoiceId:q.choices[0].id,isCorrect:false,answerDate:new Date(`2026-10-0${i+1}`),answeredAt:new Date(`2026-09-${28+i}T15:00:00Z`)}))});
   await db.dailyQaAnswer.create({data:{userId:actors[1].id,questionId:qs[0].id,selectedChoiceId:qs[0].choices[0].id,isCorrect:true,answerDate:new Date("2026-10-01")}});
   await db.randomQuizAttempt.createMany({data:[2,1,3].map((sequence,i)=>({userId,questionId:qs[i].id,selectedChoiceId:qs[i].choices[0].id,isCorrect:i!==2,answerDate:new Date("2026-10-01"),answeredAt:now,answerSequence:sequence})).concat([{userId,questionId:qs[4].id}])});
   await db.studentActivityDay.createMany({data:[{userId,activityDate:new Date("2026-10-20"),hasAnswered:false},{userId,activityDate:new Date("2026-10-21"),hasAnswered:true}]});
   await db.studentNavigationProgress.create({data:{userId,tabId:randomUUID(),lastSequence:11,stage:"home",roundTrips:5}});
   const titles=await db.title.findMany({where:{catalogKey:{in:["v1-014","v1-022"]}},select:{id:true}});await db.userTitle.createMany({data:titles.map(title=>({userId,titleId:title.id}))});
   const post=await db.boardPost.create({data:{authorId:userId,body:"QA history parity",deletedAt:now}});postId=post.id;
   await db.boardComment.create({data:{postId,authorId:userId,body:"QA deleted reply",deletedAt:now}});
   await db.boardComment.create({data:{postId,authorId:actors[1].id,body:"QA foreign reply"}});
   const submitted=await db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId,attemptNo:1,startRequestId:randomUUID(),startedAt:now,expiresAt:new Date(+now+3600000),status:"submitted",submittedAt:now,gradedAt:now,totalQuestions:f.questions.length}});
   const unfinished=await db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId,attemptNo:2,startRequestId:randomUUID(),startedAt:now,expiresAt:new Date(+now+3600000),totalQuestions:f.questions.length}});
   const foreign=await db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId:actors[1].id,attemptNo:1,startRequestId:randomUUID(),startedAt:now,expiresAt:new Date(+now+3600000),status:"submitted",submittedAt:now,gradedAt:now,totalQuestions:f.questions.length}});
   await db.mockAnswer.createMany({data:[{attemptId:submitted.id,mockExamId:f.mockExamId,mockQuestionId:f.questions[0].id,selectedChoiceId:f.questions[0].correctChoiceId,isCorrect:true,answeredAt:now},{attemptId:submitted.id,mockExamId:f.mockExamId,mockQuestionId:f.questions[1].id,selectedChoiceId:null,isCorrect:null},{attemptId:unfinished.id,mockExamId:f.mockExamId,mockQuestionId:f.questions[0].id,selectedChoiceId:f.questions[0].correctChoiceId,isCorrect:true,answeredAt:now},{attemptId:foreign.id,mockExamId:f.mockExamId,mockQuestionId:f.questions[0].id,selectedChoiceId:f.questions[0].correctChoiceId,isCorrect:true,answeredAt:now}]});
   await db.mockExam.update({where:{id:f.mockExamId},data:{rankingFinalizedAt:now}});
   await db.monthlyRanking.create({data:{mockExamId:f.mockExamId,targetMonth:new Date("2095-12-01"),userId,bestAttemptId:submitted.id,rankNo:3,mockScore:1,correctCount:1,totalQuestions:60,isFinal:true}});
   const policy=getMockPolicy("it_passport"),schedule=getMockSchedule("2096-01");
   const next=await db.mockExam.create({data:{examId:f.examId,targetMonth:new Date("2096-01-01"),title:"QA history next month",timeLimitMinutes:policy.timeLimitMinutes,questionCount:policy.questionCount,status:"ready",availableFrom:schedule.opensAt,availableUntil:schedule.closesAt,rankingFinalizedAt:now}});f.trackExam(next.id);
   const nextAttempt=await db.mockAttempt.create({data:{mockExamId:next.id,userId,attemptNo:1,startRequestId:randomUUID(),startedAt:now,expiresAt:new Date(+now+3600000),status:"submitted",submittedAt:now,gradedAt:now,totalQuestions:60}});
   await db.monthlyRanking.create({data:{mockExamId:next.id,targetMonth:new Date("2096-01-01"),userId,bestAttemptId:nextAttempt.id,rankNo:1,mockScore:1,correctCount:1,totalQuestions:60,isFinal:true}});
   await compare(db,"all saved histories, deleted board rows, submitted mocks, year boundary rankings");
   const actual=await collectTitleFacts(db,userId,now,{mockExamsEnabled:true});assert.equal(actual.answerCount,100);assert.equal(actual.boardPostCount,1);assert.equal(actual.boardCommentCount,1);assert.equal(actual.ranking.it_passport.topThreeMaxRun,2);
   await assert.rejects(()=>db.$transaction(async tx=>{
    await tx.dailyQaAnswer.create({data:{userId,questionId:qs[0].id,selectedChoiceId:qs[0].choices[0].id,isCorrect:true,answerDate:new Date("2026-10-28")}});
    await compare(tx,"same-transaction uncommitted answer");throw Error("rollback parity marker");
   },{timeout:30000}),/rollback parity marker/);
   await compare(db,"after rollback");
   await db.studentProfile.delete({where:{userId}});await compare(db,"missing profile");
   t.diagnostic("Equivalent old/new facts for empty, populated, feature-disabled, same-transaction, rollback and missing-profile data");
  }finally{
   if(postId){await db.boardComment.deleteMany({where:{postId}});await db.boardPost.delete({where:{id:postId}});}
  }
 });
});
