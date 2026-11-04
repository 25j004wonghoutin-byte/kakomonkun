import { ReviewNotebookError, type ReviewActor } from "./contract";
import type { ReviewAiInput, ReviewAiResult } from "./ai-contract";
import { parseReviewId } from "./request";
import { assertReviewStudent } from "./rules";

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
function parseInput(value: unknown): ReviewAiInput {
  const invalid = () => new ReviewNotebookError("invalid_input", 400, "入力内容を確認してください。");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 2 || Object.keys(body).some(key => !["answerRevision", "questionVersion"].includes(key))) throw invalid();
  if (typeof body.answerRevision !== "number" || !Number.isInteger(body.answerRevision) || body.answerRevision < 1 || body.answerRevision > 2147483647) throw invalid();
  if (typeof body.questionVersion !== "string" || !/^[0-9a-f]{64}$/.test(body.questionVersion)) throw invalid();
  return { answerRevision: body.answerRevision, questionVersion: body.questionVersion };
}
export function createReviewAiHandler(deps: {
  getUser(): Promise<ReviewActor | null>;
  explain(actor: ReviewActor, itemId: string, input: ReviewAiInput): Promise<ReviewAiResult>;
}) {
  return async (request: Request, params: { itemId: string }) => {
    try {
      const actor = await deps.getUser(); assertReviewStudent(actor);
      const itemId = parseReviewId(params.itemId);
      let body: unknown;
      try { body = await request.json(); } catch { throw new ReviewNotebookError("invalid_json", 400, "入力内容を確認してください。"); }
      return Response.json(await deps.explain(actor, itemId, parseInput(body)), { headers });
    } catch (cause) {
      const error = cause instanceof ReviewNotebookError ? cause : new ReviewNotebookError("ai_unavailable", 500, "AI解説を取得できませんでした。再試行してください。");
      return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    }
  };
}
