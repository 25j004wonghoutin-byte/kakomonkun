import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PracticeReviewLink } from "../src/components/practice-review-link.tsx";
import { countPracticeReviewItems } from "../src/lib/review-notebook/read.ts";
import { makeReviewMemory } from "./helpers/review-notebook-memory.mjs";
const sessionId = "11111111-1111-4111-8111-111111111111";
const render = count => renderToStaticMarkup(React.createElement(PracticeReviewLink, { sessionId, reviewNotebookCount: count }));
test("session link includes all registered wrong items", () => {
  const html = render(2); assert.match(html, /今回間違えた問題を復習/); assert.match(html, /status=all/); assert.ok(html.includes(sessionId));
});
test("no link for zero missing or teacher count", () => { for (const count of [0, null, undefined]) assert.equal(render(count), ""); });
test("old result view cannot backfill items", async () => {
  const memory = makeReviewMemory({ reviewItems: [], sessions: [{ id: sessionId, userId: "student" }], practiceAnswers: [{ sessionId, questionId: "q", isCorrect: false }] });
  const before = structuredClone(memory.state); const count = await countPracticeReviewItems({ ...memory.tx, ...memory.prisma }, "student", sessionId);
  assert.equal(count, 0); assert.deepEqual(memory.state, before); assert.equal(render(count), "");
});
