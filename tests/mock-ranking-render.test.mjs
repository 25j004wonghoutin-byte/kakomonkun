import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
test("ranking includes everyone tied in third rank, own lower rank, exam/month controls and disabled profile links",async()=>{
  const p=new URL("../src/app/ranking/ranking-view.tsx",import.meta.url);assert.ok(existsSync(p),"ranking view must exist");
  const {RankingViewContent}=await import(p.href);
  const row=(userId,rankNo,profileHref=`/board/users/${userId}`)=>({userId,rankNo,score:50,displayName:`学生${userId}`,avatarUrl:null,currentTitleName:"初期称号",profileHref});
  const html=renderToStaticMarkup(React.createElement(RankingViewContent,{data:{examCode:"fe",month:"2040-01",availableMonths:["2040-01","2039-12"],state:"settling",top:[row("a",1),row("b",1),row("c",3),row("d",3,null)],mine:row("me",8),rewardsComplete:false}}));
  for(const text of ["学生a","学生b","学生c","学生d","学生me","2039-12","ITパスポート","基本情報","集計中","自分の順位"])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('href="/board/users/d"'));assert.ok(html.includes('href="/board/users/me"'));
});
