import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { makeTitleMemory } from "./helpers/title-memory.mjs";

test("mock learning aggregation counts both submissions, never unfinished, empty or foreign answers",async()=>{
  const path=new URL("../src/lib/mock-exams/title-facts.ts",import.meta.url);
  assert.ok(existsSync(path),"submitted mock fact aggregation is required");
  const {collectMockLearningFacts}=await import(path.href);
  const row=(id,categoryCode,isCorrect,selectedChoiceId="choice",status="submitted",userId="student")=>({mockQuestionId:id,mockQuestion:{categoryCode},isCorrect,selectedChoiceId,attempt:{userId,status}});
  const memory=makeTitleMemory({mockAnswers:[
    row("q1","technology",true),row("q1","technology",true),row("q2","management",false),row("q3","strategy",true),
    row("q1","technology",true,null),row("q1","technology",true,"choice","in_progress"),row("q1","technology",true,"choice","submitted","other"),
  ]});
  assert.deepEqual(await collectMockLearningFacts(memory.tx,"student"),{answerCount:4,categoryCorrect:{technology:2,management:0,strategy:1}});
  memory.state.mockAnswers=[];
  assert.deepEqual(await collectMockLearningFacts(memory.tx,"student"),{answerCount:0,categoryCorrect:{technology:0,management:0,strategy:0}});
});
