import { ReviewNotebookError, type ReviewActor, type ReviewAnswerInput, type ReviewQuery } from "./contract";
import { parseReviewAnswer, parseReviewId, parseReviewQuery } from "./request";
import { assertReviewStudent } from "./rules";

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
export function createReviewNotebookHandlers(deps: {
  getUser(): Promise<ReviewActor | null>;
  service: {
    list(userId: string, query: ReviewQuery): Promise<unknown>;
    item(userId: string, itemId: string): Promise<unknown>;
    answer(actor: ReviewActor, itemId: string, input: ReviewAnswerInput): Promise<unknown>;
  };
}) {
  async function run(action: (actor: ReviewActor) => Promise<unknown>) {
    try {
      const actor = await deps.getUser(); assertReviewStudent(actor);
      return Response.json(await action(actor), { headers });
    } catch (cause) {
      const error = cause instanceof ReviewNotebookError ? cause : new ReviewNotebookError("internal_error", 500, "復習データを取得・保存できませんでした。再試行してください。");
      return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    }
  }
  return {
    list: (request: Request) => run(actor => deps.service.list(actor.id, parseReviewQuery(new URL(request.url).searchParams))),
    item: (_request: Request, params: { itemId: string }) => run(actor => deps.service.item(actor.id, parseReviewId(params.itemId))),
    answer: (request: Request, params: { itemId: string }) => run(async actor => {
      const itemId = parseReviewId(params.itemId);
      let body: unknown;
      try { body = await request.json(); } catch { throw new ReviewNotebookError("invalid_json", 400, "入力内容を確認してください。"); }
      return deps.service.answer(actor, itemId, parseReviewAnswer(body));
    }),
  };
}
