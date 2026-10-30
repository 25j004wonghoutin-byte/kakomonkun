import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

const state = { question: null, cache: new Map(), usage: [], created: [], race: false };
const prisma = {
  question: { findUnique: async ({ select }) => state.question && (select ? { imagePath: state.question.imagePath } : state.question) },
  aiExplanation: {
    findUnique: async ({ where }) => state.cache.get(where.questionId_modelName.modelName) ?? null,
    create: async ({ data }) => {
      state.created.push(data);
      if (state.race) {
        state.cache.set(data.modelName, { ...data, answerText: "同時生成された解説" });
        throw new Error("unique constraint");
      }
      state.cache.set(data.modelName, data);
      return data;
    },
  },
  aiUsageLog: { create: async ({ data }) => { state.usage.push(data); return data; } },
};
globalThis[Symbol.for("aiExplanationTestPrisma")] = prisma;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/prisma") return { url: "data:text/javascript,export const prisma = globalThis[Symbol.for('aiExplanationTestPrisma')];", shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { generateAiExplanation, getGeminiModelName } = await import("../src/lib/gemini.ts");
const { getOrCreateAiExplanation } = await import("../src/lib/ai-explanations.ts");
const input = {
  examName: "ITパスポート", categoryName: "マネジメント", questionText: "正しい説明はどれか。",
  officialExplanation: null, choices: [{ choiceLabel: "ア", choiceText: "原題画像を参照", isCorrect: true }],
};
const imagePath = "/kakomon/img/ipa/2024/q039.webp";
function setup(t, { image = null, cached = false, race = false } = {}) {
  state.question = { id: "question-1", imagePath: image, questionText: input.questionText, explanation: null, exam: { name: input.examName }, category: { name: input.categoryName }, choices: input.choices };
  state.cache.clear(); state.usage = []; state.created = []; state.race = race;
  if (cached) state.cache.set(getGeminiModelName(), { answerText: "古い文章のみの解説", modelName: getGeminiModelName() });
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only-key";
  t.after(() => { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return Response.json({ steps: [{ type: "model_output", content: [{ type: "text", text: "原本を確認した解説" }] }] });
  });
  return requests;
}
test("plain-text explanations preserve the existing request and response contract", async t => {
  const requests = setup(t);
  const result = await generateAiExplanation(input);
  assert.equal(requests.length, 1);
  assert.equal(typeof requests[0].body.input, "string");
  assert.match(requests[0].body.input, /正しい説明はどれか/);
  assert.equal(result.answerText, "原本を確認した解説");
  assert.equal(result.modelName, getGeminiModelName());
});
test("image explanations include the exact trusted original image and text", async t => {
  const requests = setup(t);
  await generateAiExplanation({ ...input, imagePath });
  assert.ok(Array.isArray(requests[0].body.input), "image inputs must be multimodal");
  const [text, image] = requests[0].body.input;
  assert.equal(text.type, "text");
  assert.match(text.text, /画像/);
  assert.match(text.text, /判定: 正解/);
  assert.equal(image.type, "image");
  assert.equal(image.mime_type, "image/webp");
  assert.equal(image.resolution, "high");
  assert.deepEqual(Buffer.from(image.data, "base64"), await readFile(new URL("../public" + imagePath, import.meta.url)));
});
for (const asset of ["/kakomon/../package.json", "/kakomon/%2e%2e/package.json", "https://example.com/q.png", "/kakomon/q.svg", "/kakomon/does-not-exist.png", "/kakomon\\q.png", "/kakomon/q.png?token=x"]) {
  test("invalid or missing image fails before any provider request: " + asset, async t => {
    const requests = setup(t);
    await assert.rejects(() => generateAiExplanation({ ...input, imagePath: asset }), /問題画像/);
    assert.equal(requests.length, 0);
  });
}
test("a cached plain-text explanation is still reused and usage is recorded", async t => {
  const requests = setup(t, { cached: true });
  const result = await getOrCreateAiExplanation({ questionId: "question-1", userId: "student-1" });
  assert.equal(result.explanation, "古い文章のみの解説");
  assert.equal(result.fromCache, true);
  assert.equal(result.modelName, getGeminiModelName());
  assert.equal(requests.length, 0);
  assert.deepEqual(state.usage, [{ userId: "student-1", questionId: "question-1" }]);
});
test("image generation bypasses the old text-only cache then reuses the image-aware cache", async t => {
  const requests = setup(t, { image: imagePath, cached: true });
  const first = await getOrCreateAiExplanation({ questionId: "question-1", userId: "student-1" });
  const second = await getOrCreateAiExplanation({ questionId: "question-1", userId: "student-2" });
  assert.equal(first.explanation, "原本を確認した解説");
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(second.explanation, first.explanation);
  assert.equal(first.modelName, getGeminiModelName());
  assert.equal(second.modelName, first.modelName);
  assert.equal(requests.length, 1);
  assert.ok(Array.isArray(requests[0].body.input));
  assert.equal(state.created.length, 1);
  assert.notEqual(state.created[0].modelName, getGeminiModelName());
  assert.ok(state.created[0].modelName.length <= 80);
  assert.equal(state.usage.length, 2);
});
test("a simultaneous image cache insert returns the winning explanation", async t => {
  const requests = setup(t, { image: imagePath, race: true });
  const result = await getOrCreateAiExplanation({ questionId: "question-1", userId: "student-1" });
  assert.equal(result.explanation, "同時生成された解説");
  assert.equal(result.fromCache, true);
  assert.equal(result.modelName, getGeminiModelName());
  assert.equal(requests.length, 1);
  assert.equal(state.usage.length, 1);
});
test("an unavailable original does not cache or log an incomplete explanation", async t => {
  const requests = setup(t, { image: "/kakomon/not-found.png", cached: true });
  await assert.rejects(() => getOrCreateAiExplanation({ questionId: "question-1", userId: "student-1" }), /問題画像/);
  assert.equal(requests.length, 0);
  assert.equal(state.created.length, 0);
  assert.equal(state.usage.length, 0);
});
test("a removed question returns null without usage or generation", async t => {
  const requests = setup(t);
  state.question = null;
  assert.equal(await getOrCreateAiExplanation({ questionId: "missing", userId: "student-1" }), null);
  assert.equal(requests.length, 0);
  assert.equal(state.usage.length, 0);
});
