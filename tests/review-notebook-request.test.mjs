import test from "node:test";
import assert from "node:assert/strict";
import { parseReviewQuery, parseReviewAnswer, buildReviewListHref, buildReviewItemHref } from "../src/lib/review-notebook/request.ts";
const id = "11111111-1111-4111-8111-111111111111";
const input = { requestId: id, expectedRevision: 1, questionVersion: "a".repeat(64), selectedChoiceId: id };
test("query defaults and all category normalization", () => {
  assert.deepEqual(parseReviewQuery(new URLSearchParams()), { status: "unfinished", examCode: null, categoryCode: null, page: 1, sessionId: null });
  assert.equal(parseReviewQuery(new URLSearchParams("categoryCode=all")).categoryCode, null);
});
test("query rejects malformed duplicated unknown and unsafe filters", () => {
  for (const query of ["page=0", "page=-1", "page=1.2", "page=9007199254740992", "page=1e2", "page=1&page=2", "examCode=no", "categoryCode=no", "sessionId=bad", "userId=other", "status=unreviewed"])
    assert.throws(() => parseReviewQuery(new URLSearchParams(query)), undefined, query);
});
test("answer accepts only exact client input and bounded revisions", () => {
  assert.deepEqual(parseReviewAnswer(input), input);
  for (const value of [null, [], {}, { ...input, userId: id }, { ...input, status: "reviewed" }, { ...input, isCorrect: true }, { ...input, expectedRevision: -1 }, { ...input, expectedRevision: 2147483648 }, { ...input, expectedRevision: "1" }, { ...input, questionVersion: "A".repeat(64) }, { ...input, selectedChoiceId: "bad" }]) assert.throws(() => parseReviewAnswer(value));
});
test("safe internal URLs preserve filters and session scope", () => {
  const query = parseReviewQuery(new URLSearchParams(`status=all&examCode=it_passport&page=2&sessionId=${id}`));
  assert.equal(buildReviewListHref(query), `/review-notebook?status=all&examCode=it_passport&page=2&sessionId=${id}`);
  assert.equal(buildReviewListHref(parseReviewQuery(new URLSearchParams())), "/review-notebook");
  assert.equal(buildReviewItemHref(id, query), `/review-notebook/${id}?status=all&examCode=it_passport&page=2&sessionId=${id}`);
  assert.throws(() => buildReviewItemHref("//evil.example", query));
});
