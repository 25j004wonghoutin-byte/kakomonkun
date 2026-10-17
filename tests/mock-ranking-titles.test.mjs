import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import test from "node:test";
import {TITLE_CATALOG,COMPLETE_COLLECTION_V1_KEYS} from "../src/lib/titles/catalog.ts";
import {evaluateTitleRules} from "../src/lib/titles/rules.ts";
import {collectTitleFacts} from "../src/lib/titles/facts.ts";
import {makeTitleFacts} from "./fixtures/title-facts.mjs";
import {makeTitleMemory} from "./helpers/title-memory.mjs";
import {randomUUID} from "node:crypto";
import {withMockDb} from "./helpers/mock-db.mjs";

const zero=()=>({it_passport:{rankCounts:{1:0,2:0,3:0},topThreeMaxRun:0},fe:{rankCounts:{1:0,2:0,3:0},topThreeMaxRun:0}});
const keys=(ranking)=>evaluateTitleRules(makeTitleFacts({ranking}),TITLE_CATALOG);
const rank=(month,rankNo,code="fe",overrides={})=>({userId:"student",targetMonth:new Date(`${month}-01`),rankNo,isFinal:true,
  mockExam:{targetMonth:new Date(`${month}-01`),rankingFinalizedAt:new Date(`${month}-25`),exam:{code}},...overrides});
async function collector(){
  const path=new URL("../src/lib/mock-exams/ranking-title-facts.ts",import.meta.url);
  assert.ok(existsSync(path),"finalized per-exam ranking fact collector is required");
  return (await import(path.href)).collectRankingTitleFacts;
}

for(const code of ["it_passport","fe"])for(const [place,single,triple] of [[1,"v1-009","v1-044"],[2,"v1-042","v1-040"],[3,"v1-043","v1-041"]]){
  test(`${code}: exact rank ${place} unlocks once and three times, never a different medal`,()=>{
    const facts=zero();assert.deepEqual(keys(facts),[]);
    facts[code].rankCounts[place]=1;assert.deepEqual(keys(facts),[single]);
    facts[code].rankCounts[place]=2;assert.deepEqual(keys(facts),[single]);
    facts[code].rankCounts[place]=3;assert.deepEqual(new Set(keys(facts)),new Set([single,triple]));
  });
}

test("different exams never combine rank counts or top-three runs",()=>{
  const facts=zero();facts.it_passport.rankCounts[2]=2;facts.fe.rankCounts[2]=1;
  facts.it_passport.topThreeMaxRun=3;facts.fe.topThreeMaxRun=2;
  assert.deepEqual(keys(facts),["v1-042"]);
  facts.fe.rankCounts[2]=3;facts.fe.topThreeMaxRun=5;
  assert.deepEqual(new Set(keys(facts)),new Set(["v1-011","v1-040","v1-042"]));
  assert.equal(COMPLETE_COLLECTION_V1_KEYS.length,58);
  for(const title of TITLE_CATALOG.filter(row=>row.condition?.type.startsWith("monthly_")))assert.ok(!COMPLETE_COLLECTION_V1_KEYS.includes(title.key));
});

test("collector excludes provisional, foreign, unsupported and unfinalized exam rows",async()=>{
  const collect=await collector();const memory=makeTitleMemory({rankings:[
    rank("2038-01",1),rank("2038-02",2),rank("2038-03",3,"it_passport"),
    rank("2038-04",1,"fe",{isFinal:false}),rank("2038-05",1,"fe",{userId:"other"}),
    rank("2038-06",1,"unsupported"),{userId:"student",rankNo:1,isFinal:true,targetMonth:new Date("2020-01-01"),mockExam:null},
    rank("2038-07",1,"fe",{mockExam:{targetMonth:new Date("2038-07-01"),rankingFinalizedAt:null,exam:{code:"fe"}}}),
  ]});
  assert.deepEqual(await collect(memory.tx,"student"),{it_passport:{rankCounts:{1:0,2:0,3:1},topThreeMaxRun:1},fe:{rankCounts:{1:1,2:1,3:0},topThreeMaxRun:2}});
});

test("calendar streak crosses December, gaps and fourth place break it, historical maximum survives",async()=>{
  const collect=await collector();const memory=makeTitleMemory({rankings:[
    rank("2038-11",3),rank("2038-12",2),rank("2039-01",1),rank("2039-02",3),rank("2039-03",2),
    rank("2039-04",4),rank("2039-05",1),rank("2039-07",1),
    rank("2039-08",1,"it_passport"),rank("2039-09",2,"it_passport"),rank("2039-10",3,"it_passport"),
  ].reverse()});
  const facts=await collect(memory.tx,"student");
  assert.equal(facts.fe.topThreeMaxRun,5);assert.equal(facts.it_passport.topThreeMaxRun,3);assert.ok(keys(facts).includes("v1-011"));
  memory.state.rankings=memory.state.rankings.filter(row=>row.targetMonth.toISOString().slice(0,7)!=="2039-01");
  const missing=await collect(memory.tx,"student");assert.equal(missing.fe.topThreeMaxRun,2);assert.ok(!keys(missing).includes("v1-011"));
});

test("feature off reads no ranking tables, while enabled normal title evaluation includes final facts",async()=>{
  const memory=makeTitleMemory({rankings:[rank("2038-01",1)]});
  const enabled=await collectTitleFacts(memory.tx,"student",new Date("2038-02-01"),{mockExamsEnabled:true});
  assert.deepEqual(keys(enabled.ranking),["v1-009"]);
  Object.defineProperty(memory.tx,"monthlyRanking",{get(){throw new Error("disabled ranking query");}});
  const disabled=await collectTitleFacts(memory.tx,"student",new Date("2038-02-01"),{mockExamsEnabled:false});
  assert.deepEqual(disabled.ranking,zero());
});

test("real final history refreshes an already-backfilled shop; seven qualifications persist and buy manually",{skip:process.env.KAKOMON_RUN_MOCK_DB_QA!=="1",timeout:300000},async()=>{
  const {getMockSchedule}=await import("../src/lib/mock-exams/schedule.ts");
  const {backfillTitleUnlocks}=await import("../src/lib/titles/unlocks.ts");
  const {purchaseTitle}=await import("../src/lib/titles/purchase.ts");
  const {toTitleShopItems}=await import("../src/lib/titles/shop.ts");
  const collect=await collector();
  await withMockDb({examCode:"fe",month:"2042-01"},async f=>{
    f.setNow(new Date("2043-01-01T12:00:00+09:00"));
    const backfilled=new Date("2041-01-01");
    await f.db.studentProfile.update({where:{userId:f.actor.id},data:{titleBackfilledAt:backfilled,titleTrackingStartedAt:backfilled}});
    const itExam=await f.db.exam.findUniqueOrThrow({where:{code:"it_passport"}});
    for(const [month,place,code,isFinal,finalized] of [
      ...[1,2,3,1,2,3,1,2,3,4].map((place,i)=>[`2042-${String(i+1).padStart(2,"0")}`,place,"fe",true,true]),
      ["2042-11",1,"fe",false,true],["2042-12",1,"fe",true,false],["2042-01",1,"it_passport",true,true],
    ]){
      const schedule=getMockSchedule(month),targetMonth=new Date(`${month}-01`),mockExamId=month==="2042-01"&&code==="fe"?f.mockExamId:randomUUID();
      if(mockExamId!==f.mockExamId){
        f.trackExam(mockExamId);
        await f.db.mockExam.create({data:{id:mockExamId,examId:code==="fe"?f.examId:itExam.id,title:`QA ranking history ${f.runId}`,targetMonth,questionCount:code==="fe"?60:100,timeLimitMinutes:code==="fe"?90:120,status:"ready",availableFrom:schedule.opensAt,availableUntil:schedule.closesAt,createdBy:f.actor.id}});
      }
      if(finalized)await f.db.mockExam.update({where:{id:mockExamId},data:{rankingFinalizedAt:schedule.closesAt}});
      const startedAt=new Date(`${month}-02T00:00:00+09:00`),expiresAt=new Date(+startedAt+5400000),totalQuestions=code==="fe"?60:100;
      const attempt=await f.db.mockAttempt.create({data:{mockExamId,userId:f.actor.id,startRequestId:randomUUID(),attemptNo:1,startedAt,expiresAt,status:"submitted",submittedAt:expiresAt,gradedAt:expiresAt,totalQuestions,answeredCount:1,correctCount:1}});
      await f.db.monthlyRanking.create({data:{mockExamId,targetMonth,userId:f.actor.id,bestAttemptId:attempt.id,rankNo:place,mockScore:100/totalQuestions,correctCount:1,totalQuestions,isFinal}});
    }
    const facts=await collect(f.db,f.actor.id);
    assert.deepEqual(facts.fe,{rankCounts:{1:3,2:3,3:3},topThreeMaxRun:9});
    assert.deepEqual(facts.it_passport,{rankCounts:{1:1,2:0,3:0},topThreeMaxRun:1});
    assert.deepEqual(await collect(f.db,f.actors[1].id),zero());
    const required=["v1-009","v1-011","v1-040","v1-041","v1-042","v1-043","v1-044"];
    const first=await backfillTitleUnlocks(f.db,f.actor.id,f.now());
    assert.deepEqual(new Set(first.newlyUnlockedKeys),new Set(required));
    assert.deepEqual((await backfillTitleUnlocks(f.db,f.actor.id,f.now())).newlyUnlockedKeys,[]);
    const rows=await f.db.title.findMany({where:{catalogKey:{in:required}},include:{unlocks:{where:{userId:f.actor.id}},userTitles:{where:{userId:f.actor.id}}}});
    assert.ok(toTitleShopItems(rows.map(({unlocks,...row})=>({...row,userTitleUnlocks:unlocks})),0).every(row=>row.state==="available"));
    assert.equal(await f.db.userTitleUnlock.count({where:{userId:f.actor.id,titleId:{in:rows.map(row=>row.id)}}}),7);
    for(const title of rows)assert.equal(await f.db.notification.count({where:{recipientId:f.actor.id,titleId:title.id}}),1);
    assert.equal(await f.db.userTitle.count({where:{userId:f.actor.id}}),0);
    const champion=rows.find(row=>row.catalogKey==="v1-009");
    // 機能停止中も、すでに証明して保存した資格は消えず無料購入できる。
    const enabled=process.env.KAKOMON_MOCK_ENABLED;
    try{
      process.env.KAKOMON_MOCK_ENABLED="false";
      await backfillTitleUnlocks(f.db,f.actor.id,f.now());
      const bought=await f.db.$transaction(tx=>purchaseTitle(tx,f.actor.id,champion.id,f.now()),{maxWait:10000,timeout:30000});
      assert.equal(bought.totalPoints,0);
      await assert.rejects(f.db.$transaction(tx=>purchaseTitle(tx,f.actor.id,champion.id,f.now()),{maxWait:10000,timeout:30000}),error=>error.code==="owned");
    }finally{process.env.KAKOMON_MOCK_ENABLED=enabled;}
    const profile=await f.db.studentProfile.findUniqueOrThrow({where:{userId:f.actor.id}});
    assert.equal(profile.currentTitleId,null);assert.equal(profile.totalPoints,0);assert.equal(+profile.titleBackfilledAt,+backfilled);
    assert.equal(await f.db.pointTransaction.count({where:{userId:f.actor.id}}),0);
    assert.equal(await f.db.userTitle.count({where:{userId:f.actor.id}}),1);
    assert.equal(await f.db.notification.count({where:{recipientId:f.actor.id,titleId:{in:rows.map(row=>row.id)}}}),7);
  });
});
