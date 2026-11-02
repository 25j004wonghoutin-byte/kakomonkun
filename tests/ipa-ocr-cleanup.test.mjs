import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

async function cleanup() {
  const url = new URL("../scripts/remove-ipa-ocr.mjs", import.meta.url);
  assert.ok(existsSync(url), "OCR cleanup must validate the exact official image before planning deletion");
  return import(url.href);
}
const question = {
  id: "q1", sourceKey: "ipa-it-passport-2024-039", sourceYear: 2024,
  sourceSeason: "公開問題", questionNo: 39, imagePath: "/kakomon/img/ipa/2024/q039.webp",
  questionText: "UNWANTED_OCR_BODY", choices: [{ id: "c1", isCorrect: true }],
};
test("cleanup changes only the OCR body and is idempotent", async () => {
  const { planIpaOcrCleanup } = await cleanup();
  const before = structuredClone(question);
  const plan = planIpaOcrCleanup([question]);
  assert.deepEqual(plan, [{ id: "q1", oldText: "UNWANTED_OCR_BODY", text: "2024年度 ITパスポート試験 公開問題 問39（原題画像を参照）" }]);
  assert.deepEqual(question, before);
  assert.deepEqual(planIpaOcrCleanup([{ ...question, questionText: plan[0].text }]), []);
});
test("cleanup rejects mismatched identity, image, season and unsupported years before writes", async () => {
  const { planIpaOcrCleanup } = await cleanup();
  for (const invalid of [
    { sourceKey: "it-passport-supplemental-1" }, { imagePath: null },
    { imagePath: "/kakomon/img/ipa/2024/q040.webp" }, { sourceYear: 2030 },
    { sourceYear: 2024.5 }, { questionNo: 0 }, { questionNo: 101 }, { sourceSeason: "手作り問題" },
  ]) assert.throws(() => planIpaOcrCleanup([{ ...question, ...invalid }]));
});
test("cleanup rejects duplicate identities and invalid body values", async () => {
  const { planIpaOcrCleanup } = await cleanup();
  assert.throws(() => planIpaOcrCleanup([question, { ...question }]));
  assert.throws(() => planIpaOcrCleanup([{ ...question, questionText: null }]));
});

test("frozen snapshots are selected by official master identity and reject a damaged source key", async () => {
  const { selectIpaSnapshots } = await cleanup();
  const good = { ...question, id: "s1", questionId: "q1" };
  assert.deepEqual(selectIpaSnapshots([good], [question]), [good]);
  assert.throws(() => selectIpaSnapshots([{ ...good, sourceKey: "damaged-key" }], [question]));
  assert.throws(() => selectIpaSnapshots([{ ...good, questionId: "unrelated" }], [question]));
  assert.deepEqual(selectIpaSnapshots([{ ...good, sourceKey: "unrelated-key", questionId: "unrelated" }], [question]), []);
});
