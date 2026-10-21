import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
async function view(path,name,props){const p=new URL(path,import.meta.url);assert.ok(existsSync(p),`${name} must exist`);const m=await import(p.href);return renderToStaticMarkup(React.createElement(m[name],props));}
const question={id:"q",orderNo:1,questionText:"検証問題",imagePath:null,sourceLabel:"検証出典",choices:["ア","イ","ウ","エ"].map((label,i)=>({id:`c${i}`,label,text:`選択肢${label}`,orderNo:i+1}))};
const result={attemptId:"a",mockExamId:"e",attemptNo:1,answeredCount:1,correctCount:1,totalQuestions:60,score:1.67,earnedPoints:20,bestAttemptId:"a",bestScore:1.67,submittedAt:"2040-01-02T00:00:00Z",reviewAvailableAt:"2040-01-24T15:00:00Z",review:null};
test("mock list renders both exams, remaining attempts and private history",async()=>{
  const html=await view("../src/app/mock-exam/mock-exam-list.tsx","MockExamListView",{data:{month:"2040-01",historyMonths:["2039-12"],exams:[{id:"e",examCode:"fe",title:"基本情報技術者（科目A）",questionCount:60,timeLimitMinutes:90,opensAt:"2040-01-01T00:00:00+09:00",closesAt:"2040-01-25T00:00:00+09:00",state:"open",remainingAttempts:1,activeAttemptId:null,results:[result]},{id:null,examCode:"it_passport",title:"ITパスポート",questionCount:100,timeLimitMinutes:120,opensAt:"2040-01-01T00:00:00+09:00",closesAt:"2040-01-25T00:00:00+09:00",state:"preparing",remainingAttempts:2,activeAttemptId:null,results:[]}]},onStart(){},busy:false});
  assert.match(html,/基本情報/);assert.match(html,/ITパスポート/);assert.match(html,/残り1回/);assert.match(html,/2039-12/);assert.match(html,/100問/);assert.match(html,/120分/);assert.doesNotMatch(html,/correctChoiceId|isCorrect|explanation/);
});
test("attempt HTML has unanswered count, saved status, navigation and no grading information",async()=>{
  const html=await view("../src/app/mock-exam/attempts/[attemptId]/mock-attempt.tsx","MockAttemptView",{attempt:{id:"a",mockExamId:"e",attemptNo:1,status:"in_progress",startedAt:"2040-01-02T00:00:00Z",expiresAt:"2040-01-02T01:30:00Z",serverNow:"2040-01-02T00:00:00Z",revision:0,questions:[question],answers:[{mockQuestionId:"q",selectedChoiceId:null,revision:0}]},index:0,remainingSeconds:5400,saving:false,blocked:false,onSelect(){},onMove(){},onSubmit(){}});
  assert.match(html,/未回答1問/);assert.match(html,/保存済み/);assert.match(html,/90:00/);assert.match(html,/選択を解除/);assert.doesNotMatch(html,/correctChoiceId|isCorrect|explanation|正解は/);
});
test("result HTML before close never includes hidden review, after close displays fallback explanation",async()=>{
  const hidden=await view("../src/app/mock-exam/attempts/[attemptId]/result/mock-result.tsx","MockResultView",{result});
  assert.match(hidden,/正解・解説は/);assert.match(hidden,/1.67/);assert.doesNotMatch(hidden,/検証問題|correctChoiceId|isCorrect|explanation/);
  const released=await view("../src/app/mock-exam/attempts/[attemptId]/result/mock-result.tsx","MockResultView",{result:{...result,review:[{...question,selectedChoiceId:"c0",correctChoiceId:"c0",isCorrect:true,explanation:"解説は未登録です"}]}});
  assert.match(released,/解説は未登録です/);assert.match(released,/検証問題/);
});

test("released review shows every frozen choice text, including selected and correct answers without an explanation",async()=>{
  const released=await view("../src/app/mock-exam/attempts/[attemptId]/result/mock-result.tsx","MockResultView",{result:{...result,review:[{...question,selectedChoiceId:"c1",correctChoiceId:"c0",isCorrect:false,explanation:"解説は未登録です"}]}});
  assert.match(released,/選択肢ア/);assert.match(released,/選択肢イ/);assert.match(released,/選択肢ウ/);assert.match(released,/選択肢エ/);
  assert.match(released,/あなたの回答：イ/);assert.match(released,/正解：ア/);
  const hidden=await view("../src/app/mock-exam/attempts/[attemptId]/result/mock-result.tsx","MockResultView",{result});
  assert.doesNotMatch(hidden,/選択肢ア|選択肢イ|選択肢ウ|選択肢エ/);
});
