import type { ReviewAnswerResult, ReviewDetail } from "./contract";
import { initialReviewAiState, type ReviewAiInput, type ReviewAiResult, type ReviewAiState } from "./ai-contract";

export function createReviewAiController(deps: {
  detail: Pick<ReviewDetail, "id" | "questionVersion">;
  result: Pick<ReviewAnswerResult, "item"> | null;
  send(itemId: string, input: ReviewAiInput, signal: AbortSignal): Promise<ReviewAiResult>;
  onState(value: ReviewAiState): void;
}) {
  let state = initialReviewAiState(), disposed = false;
  let request: AbortController | null = null;
  const emit = () => { if (!disposed) deps.onState({ ...state }); };
  return {
    async request() {
      if (disposed || state.loading || state.result || state.requiresReload || state.requiresLogin || state.unavailable || !deps.result || deps.result.item.id !== deps.detail.id) return;
      request = new AbortController();
      const current = request;
      state = { ...state, loading: true, error: "" }; emit();
      try {
        const result = await deps.send(deps.detail.id, { answerRevision: deps.result.item.revision, questionVersion: deps.detail.questionVersion }, current.signal);
        if (disposed || current.signal.aborted) return;
        state = { ...state, loading: false, result }; emit();
      } catch (cause) {
        if (disposed || current.signal.aborted) return;
        const status = cause && typeof cause === "object" && "status" in cause ? cause.status : 0;
        const requiresLogin = status === 401, unavailable = status === 403 || status === 404, requiresReload = status === 400 || status === 409;
        state = { ...state, loading: false, result: null, requiresLogin, unavailable, requiresReload,
          error: requiresLogin ? "ログインし直してください。" : unavailable ? "この問題は利用できません。" : requiresReload ? "問題や復習状況が更新されました。再読み込みしてください。" : "AI解説を取得できませんでした。再試行してください。" };
        emit();
      } finally { if (request === current) request = null; }
    },
    dispose() { disposed = true; request?.abort(); request = null; },
  };
}
