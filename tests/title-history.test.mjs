import assert from "node:assert/strict";
import test from "node:test";
let history = {};
try { history = await import("../src/lib/titles/history.ts"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const empty = () => ({ profile: null, daily: [], random: [], practiceAnswers: [], sessions: [], owned: [], boardPostCount: 0, boardCommentCount: 0, mock: { answerCount: 0, categoryCorrect: { technology: 0, management: 0, strategy: 0 } }, rankings: [] });
async function read(row, enabled = true) {
 assert.equal(typeof history.readTitleHistory,"function");
 let calls=0;
 const tx={ $queryRaw:async(query)=>{calls++;const strings={join:()=>query.sql},values=query.values;assert.match(strings.join("?"),/title-history/);assert.deepEqual(values,["student",enabled]);if(!enabled){assert.ok(!strings.join("?").includes("public.mock_answers"),"disabled feature must not depend on mock tables");}assert.ok(!strings.join("?").includes("student'"));return row===undefined?[]:[row];} };
 const result=await history.readTitleHistory(tx,"student",enabled);assert.equal(calls,1,"history must require only one database round trip");return result;
}
test("an empty student's history uses one parameterized read and keeps empty totals",async()=>{
 const result=await read(empty());assert.equal(result.profile,null);assert.deepEqual(result.daily,[]);assert.equal(result.boardPostCount,0);assert.equal(result.mock.answerCount,0);assert.equal(result.ranking.it_passport.topThreeMaxRun,0);
});
test("history restores database dates, nullable random answers and legacy ownership",async()=>{
 const row=empty();row.profile={titleTrackingStartedAt:"2026-09-30T15:00:00+00:00"};
 row.daily=[{isCorrect:false,answeredAt:"2026-10-01T01:00:00Z",answerDate:"2026-10-01",categoryCode:"technology"}];
 row.random=[{isCorrect:null,answeredAt:"2026-10-02T01:00:00Z",answerDate:null,categoryCode:"strategy"}];
 row.practiceAnswers=[{isCorrect:true,answeredAt:"2026-10-01T15:00:00Z",categoryCode:"management"}];row.owned=[{titleId:"legacy",catalogKey:null}];row.boardPostCount=3;
 const result=await read(row);assert.equal(result.profile.titleTrackingStartedAt.toISOString(),"2026-09-30T15:00:00.000Z");assert.equal(result.daily[0].answerDate.toISOString(),"2026-10-01T00:00:00.000Z");assert.equal(result.daily[0].question.category.code,"technology");assert.equal(result.random[0].answerDate,null);assert.equal(result.random[0].isCorrect,null);assert.equal(result.practiceAnswers[0].answeredAt.toISOString(),"2026-10-01T15:00:00.000Z");assert.deepEqual(result.owned,[{titleId:"legacy",title:{catalogKey:null}}]);assert.equal(result.boardPostCount,3);
});
test("history retains submitted mock counts and finalized ranking month runs",async()=>{
 const row=empty();row.mock={answerCount:8,categoryCorrect:{technology:3,management:2,strategy:1}};row.rankings=[{rankNo:3,targetMonth:"2025-12-01",examCode:"it_passport"},{rankNo:1,targetMonth:"2026-01-01",examCode:"it_passport"},{rankNo:1,targetMonth:"2026-01-01",examCode:"fe"}];
 const result=await read(row);assert.deepEqual(result.mock,row.mock);assert.equal(result.ranking.it_passport.topThreeMaxRun,2);assert.equal(result.ranking.fe.topThreeMaxRun,1);assert.equal(result.ranking.it_passport.rankCounts[1],1);
});
test("disabled mock learning is passed as a bound false flag",async()=>{const result=await read(empty(),false);assert.equal(result.mock.answerCount,0);});
test("an absent history result fails rather than pretending a valid empty history",async()=>{await assert.rejects(()=>read(undefined),/Title history query returned no row/);});
