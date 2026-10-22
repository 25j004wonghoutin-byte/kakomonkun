import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
test("ranking includes everyone tied in third rank, own lower rank, exam/month controls and disabled profile links",async()=>{
  const p=new URL("../src/app/ranking/ranking-view.tsx",import.meta.url);assert.ok(existsSync(p),"ranking view must exist");
  const {RankingViewContent}=await import(p.href);
  const row=(userId,rankNo,profileHref=`/board/users/${userId}`)=>({userId,rankNo,score:50,displayName:`学生${userId}`,avatarUrl:null,currentTitleName:"初期称号",profileHref});
  const html=renderToStaticMarkup(React.createElement(RankingViewContent,{data:{examCode:"fe",month:"2040-01",currentMonth:"2040-01",availableMonths:["2040-01","2039-12"],participantCount:12,state:"settling",top:[row("a",1),row("b",1),row("c",3),row("d",3,null)],mine:row("me",8),rewardsComplete:false}}));
  for(const text of ["学生a","学生b","学生c","学生d","学生me","2039年12月","ITパスポート","基本情報","集計中","あなたの順位"])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('href="/board/users/d"'));assert.ok(html.includes('href="/board/users/me"'));
  assert.equal((html.match(/<article\b/g)||[]).length,4,"all tied podium students have a card");
  assert.equal((html.match(/>プロフィールを見る<\/a>/g)||[]).length,3,"unavailable profiles have no button");
  assert.ok(html.includes("12人中"),"denominator is the server's submitted participant count");
  assert.ok(html.includes("8位"),"own lower rank is not omitted");
  assert.ok(!html.includes("ランキング一覧"),"no full ranking list or link is offered");
});

const student=(userId,rankNo,score)=>({userId,rankNo,score,displayName:`学生${userId}`,avatarUrl:null,currentTitleName:"学びを続ける人",profileHref:`/board/users/${userId}`});
const data=()=>({examCode:"fe",month:"2040-02",currentMonth:"2040-02",availableMonths:["2040-02","2040-01","2039-12"],participantCount:120,state:"provisional",top:[student("a",1,92.4),student("b",2,88.7),student("c",3,86.1)],mine:student("me",8,72.33),rewardsComplete:false});
async function render(overrides={}){
  const {RankingViewContent}=await import("../src/app/ranking/ranking-view.tsx");
  return renderToStaticMarkup(React.createElement(RankingViewContent,{data:{...data(),...overrides}}));
}
test("podium cards retain precise scores, equipped titles and accessible rank headings",async()=>{
  const html=await render();
  for(const rank of [1,2,3])assert.match(html,new RegExp(`<h[23][^>]*>${rank}位</h[23]>`));
  for(const score of ["92.40","88.70","86.10","72.33"])assert.ok(html.includes(score),score);
  assert.equal((html.match(/学びを続ける人/g)||[]).length,4);
});
test("current and past navigation and month selection preserve the selected exam",async()=>{
  const html=await render();
  assert.match(html,/<a[^>]*aria-current="page"[^>]*href="\/ranking\?examCode=fe&amp;month=2040-02"[^>]*>今月のランキング<\/a>/);
  assert.match(html,/<a[^>]*href="\/ranking\?examCode=fe&amp;month=2040-01"[^>]*>過去のランキング<\/a>/);
  assert.match(html,/<select[^>]*aria-label="対象月を選択"/);
  assert.match(html,/<option value="2040-02" selected="">2040年2月<\/option>/);
  assert.ok(html.includes('href="/ranking?examCode=it_passport&amp;month=2040-02"'));
  const past=await render({month:"2039-12",state:"final",rewardsComplete:true});
  assert.match(past,/<a[^>]*aria-current="page"[^>]*href="\/ranking\?examCode=fe&amp;month=2039-12"[^>]*>過去のランキング<\/a>/);
  assert.ok(past.includes("確定・報酬反映済み"));
});
test("empty ranking and absent own result do not invent podium entries or a numeric rank",async()=>{
  const html=await render({top:[],mine:null,participantCount:0,availableMonths:["2040-02"]});
  assert.equal((html.match(/<article\b/g)||[]).length,0);
  assert.ok(html.includes("提出済みの受験結果はまだありません。"));
  assert.ok(html.includes("この試験・月には、まだ提出した結果がありません。"));
  assert.ok(!html.includes("プロフィールを見る"));
  assert.match(html,/<span[^>]*aria-disabled="true"[^>]*>過去のランキング<\/span>/);
  assert.ok(!html.includes("NaN"));
});
