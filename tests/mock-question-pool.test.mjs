import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const load = async name => {
  const url=new URL(`../${name}`,import.meta.url);
  assert.ok(existsSync(url),`${name} implementation is required`);
  return import(url.href);
};
const question = (extra={}) => ({
  id:"q1",sourceKey:"fe-subject-a-2025-1",sourceYear:2025,sourceSeason:"公開問題",questionNo:1,
  questionText:"正しい説明はどれか。",imagePath:null,explanation:null,status:"published",deletedAt:null,
  questionType:"single_choice",exam:{code:"fe"},category:{code:"technology"},
  choices:["ア","イ","ウ","エ"].map((label,i)=>({id:`c${i}`,choiceLabel:label,choiceText:`選択肢${i}`,isCorrect:i===0,sortOrder:i+1})),...extra,
});

test("eligible historical FE includes six-digit completion dates, but unknown/sample years do not",async()=>{
  const {isEligibleMockQuestion:eligible}=await load("src/lib/mock-exams/question-pool.ts");
  for(const q of [question(),question({sourceYear:202504,sourceSeason:"2025年4月 修了認定"}),question({exam:{code:"it_passport"},sourceYear:2021})])assert.equal(eligible(q,new Set()),true);
  for(const sourceYear of [null,0,NaN,2025.5,202513,202500,20250,9999999])assert.equal(eligible(question({sourceYear}),new Set()),false);
});

test("deleted, unpublished, unsupported exams, invalid choices and missing required images are excluded",async()=>{
  const {isEligibleMockQuestion:eligible}=await load("src/lib/mock-exams/question-pool.ts");
  const base=question();
  for(const extra of [
    {deletedAt:new Date()},{status:"draft"},{exam:{code:"subject_b"}},{questionType:"multiple_choice"},
    {choices:base.choices.slice(1)},
    {choices:base.choices.map(c=>({...c,isCorrect:false}))},
    {choices:base.choices.map((c,i)=>({...c,isCorrect:i<2}))},
    {choices:base.choices.map(c=>({...c,id:"duplicate"}))},
    {choices:base.choices.map(c=>({...c,sortOrder:1}))},
    {choices:base.choices.map(c=>({...c,choiceLabel:"ア"}))},
    {choices:base.choices.map(c=>({...c,choiceText:" "}))},
    {imagePath:"/kakomon/img/missing.png"},{imagePath:"https://example.invalid/image.png"},
    {questionText:"問題画像を参照してください。"},{questionText:" "},
  ])assert.equal(eligible(question(extra),new Set()),false,JSON.stringify(extra));
  assert.equal(eligible(question({imagePath:"/kakomon/img/a.png"}),new Set(["/kakomon/img/a.png"])),true);
  const japanesePath="/kakomon/img/202007S/スクリーンショット 2025-10-17 092708.png";
  assert.equal(eligible(question({imagePath:japanesePath}),new Set([japanesePath])),true);
});

test("selection is a nonmutating full shuffle without duplicates, not random-with-replacement",async()=>{
  const {selectMockQuestions:select}=await load("src/lib/mock-exams/question-pool.ts");
  const pool=Array.from({length:5},(_,i)=>({id:String(i)})),before=structuredClone(pool),bounds=[];
  const result=select(pool,4,max=>{bounds.push(max);return 0;});
  assert.deepEqual(result.map(q=>q.id),["1","2","3","4"]);
  assert.deepEqual(bounds,[5,4,3,2]);assert.deepEqual(pool,before);
});

test("insufficient or duplicate pools never silently shorten an exam, and invalid random bounds fail closed",async()=>{
  const {selectMockQuestions:select}=await load("src/lib/mock-exams/question-pool.ts");
  assert.throws(()=>select(Array.from({length:59},(_,i)=>({id:String(i)})),60,()=>0),e=>e.code==="insufficient_questions");
  assert.throws(()=>select([{id:"same"},{id:"same"}],2,()=>0));
  for(const bad of [-1,2,0.5,NaN])assert.throws(()=>select([{id:"a"},{id:"b"}],1,()=>bad));
});

test("asset manifest is deterministic and refuses missing, modified or unregistered served images",async()=>{
  const {buildMockAssetManifest:build,assertMockAssetManifest:check}=await load("scripts/build-mock-asset-manifest.mjs");
  const root=mkdtempSync(path.join(tmpdir(),"mock-assets-"));
  try{
    mkdirSync(path.join(root,"public/kakomon/img"),{recursive:true});
    const image=path.join(root,"public/kakomon/img/a.png");writeFileSync(image,"original");
    const manifest=build(root);
    assert.deepEqual(Object.keys(manifest.assets),["/kakomon/img/a.png"]);
    assert.deepEqual(build(root),manifest);assert.doesNotThrow(()=>check(root,manifest));
    writeFileSync(image,"changed");assert.throws(()=>check(root,manifest));
    writeFileSync(image,"original");writeFileSync(path.join(root,"public/kakomon/img/b.png"),"new");assert.throws(()=>check(root,manifest));
    rmSync(image);assert.throws(()=>check(root,manifest));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("manifest regeneration adds new images but cannot bless removal or overwrite of recorded images",async()=>{
  const {writeMockAssetManifest:write}=await load("scripts/build-mock-asset-manifest.mjs");
  assert.equal(typeof write,"function","retained asset validation is required before regeneration");
  const root=mkdtempSync(path.join(tmpdir(),"mock-retained-assets-"));
  try{
    mkdirSync(path.join(root,"public/kakomon/img"),{recursive:true});
    const image=path.join(root,"public/kakomon/img/a.png");writeFileSync(image,"original");
    write(root);
    writeFileSync(path.join(root,"public/kakomon/img/b.png"),"new");assert.doesNotThrow(()=>write(root));
    const saved=readFileSync(path.join(root,"src/lib/mock-exams/question-assets.json"));
    writeFileSync(image,"changed");assert.throws(()=>write(root));
    assert.deepEqual(readFileSync(path.join(root,"src/lib/mock-exams/question-assets.json")),saved);
    rmSync(image);assert.throws(()=>write(root));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("production build config invokes the real manifest validation and does not write runtime assets",async()=>{
  const loadConfig=createRequire(import.meta.url)("next/dist/server/config").default;
  const {default:config}=await loadConfig("phase-production-build",path.resolve("."),{rawConfig:true});
  assert.equal(typeof config,"function","build-time asset validation is required");
  const manifestUrl=new URL("../src/lib/mock-exams/question-assets.json",import.meta.url);
  const before=readFileSync(manifestUrl);
  const built=await config("phase-production-build");
  assert.equal(built.turbopack.root,path.resolve("."));
  assert.deepEqual(readFileSync(manifestUrl),before);
});
