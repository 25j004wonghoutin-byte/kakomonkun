import { PRACTICE_CATEGORIES } from "@/lib/practice-config";
import { ReviewNotebookError, type ReviewAnswerInput, type ReviewQuery } from "./contract";

const invalid = () => new ReviewNotebookError("invalid_input", 400, "入力内容を確認してください。");
export function parseReviewId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw invalid();
  return value.toLowerCase();
}
export function parseReviewQuery(params: URLSearchParams): ReviewQuery {
  const allowed = ["status", "examCode", "categoryCode", "page", "sessionId"];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw invalid();
  const status = params.get("status") ?? "unfinished";
  if (status !== "unfinished" && status !== "reviewed" && status !== "all") throw invalid();
  const examCode = params.get("examCode");
  if (examCode !== null && !["it_passport", "fe"].includes(examCode)) throw invalid();
  const category = params.get("categoryCode");
  const categoryCode = category === "all" ? null : category;
  if (categoryCode !== null && !PRACTICE_CATEGORIES.some(value => value.code === categoryCode)) throw invalid();
  const rawPage = params.get("page") ?? "1";
  const page = Number(rawPage);
  if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(page)) throw invalid();
  const rawSession = params.get("sessionId");
  return { status, examCode, categoryCode, page, sessionId: rawSession === null ? null : parseReviewId(rawSession) };
}
export function parseReviewAnswer(value: unknown): ReviewAnswerInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  const keys = ["requestId", "expectedRevision", "questionVersion", "selectedChoiceId"];
  if (Object.keys(body).length !== keys.length || Object.keys(body).some(key => !keys.includes(key))) throw invalid();
  if (typeof body.expectedRevision !== "number" || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision > 2147483647) throw invalid();
  if (typeof body.questionVersion !== "string" || !/^[0-9a-f]{64}$/.test(body.questionVersion)) throw invalid();
  return { requestId: parseReviewId(body.requestId), expectedRevision: body.expectedRevision, questionVersion: body.questionVersion, selectedChoiceId: parseReviewId(body.selectedChoiceId) };
}
function queryString(query: ReviewQuery) {
  const params = new URLSearchParams();
  if (query.status !== "unfinished") params.set("status", query.status);
  if (query.examCode) params.set("examCode", query.examCode);
  if (query.categoryCode) params.set("categoryCode", query.categoryCode);
  if (query.page !== 1) params.set("page", String(query.page));
  if (query.sessionId) params.set("sessionId", query.sessionId);
  parseReviewQuery(params);
  return params.size ? `?${params}` : "";
}
export function buildReviewListHref(query: ReviewQuery): string { return `/review-notebook${queryString(query)}`; }
export function buildReviewItemHref(itemId: string, query: ReviewQuery): string { return `/review-notebook/${parseReviewId(itemId)}${queryString(query)}`; }
