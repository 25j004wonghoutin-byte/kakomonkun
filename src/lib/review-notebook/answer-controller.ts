import type { ReviewAnswerInput, ReviewAnswerResult, ReviewDetail } from "./contract";
export type ReviewAnswerState = {
  pending: ReviewAnswerInput | null; result: ReviewAnswerResult | null; saving: boolean; error: string;
  requiresReload: boolean; requiresLogin: boolean; unavailable: boolean;
};
export const initialReviewAnswerState = (): ReviewAnswerState => ({ pending: null, result: null, saving: false, error: "", requiresReload: false, requiresLogin: false, unavailable: false });
export function createReviewAnswerController(deps: {
  detail: ReviewDetail;
  send(itemId: string, input: ReviewAnswerInput): Promise<ReviewAnswerResult>;
  newId(): string;
  onState(value: ReviewAnswerState): void;
}) {
  let detail = deps.detail, state = initialReviewAnswerState(), disposed = false, generation = 0;
  const emit = () => { if (!disposed) deps.onState({ ...state }); };
  async function send() {
    if (disposed || state.saving || !state.pending || state.requiresReload || state.requiresLogin || state.unavailable) return;
    const request = ++generation, input = { ...state.pending };
    state = { ...state, saving: true, error: "" }; emit();
    try {
      const result = await deps.send(detail.id, input);
      if (disposed || request !== generation) return;
      state = { ...state, result, pending: null, saving: false }; emit();
    } catch (cause) {
      if (disposed || request !== generation) return;
      const status = cause && typeof cause === "object" && "status" in cause ? cause.status : 0;
      const requiresLogin = status === 401, unavailable = status === 404 || status === 403, requiresReload = status === 409 || status === 400;
      state = { ...state, saving: false, result: null, requiresLogin, unavailable, requiresReload,
        pending: requiresLogin || unavailable || requiresReload ? null : state.pending,
        error: requiresLogin ? "ログインし直してください。" : unavailable ? "この問題は利用できません。一覧へ戻ってください。" : requiresReload ? "問題や復習状況が更新されました。再読み込みしてください。" : "回答を保存できませんでした。同じ回答を再試行してください。" };
      emit();
    }
  }
  return {
    async submit(choiceId: string) {
      if (disposed || state.pending || state.result || state.requiresReload || state.requiresLogin || state.unavailable || !detail.question.choices.some(choice => choice.id === choiceId)) return;
      state = { ...state, pending: { requestId: deps.newId(), expectedRevision: detail.revision, questionVersion: detail.questionVersion, selectedChoiceId: choiceId } };
      await send();
    },
    retry: send,
    reset(next: ReviewDetail) { if (disposed) return; generation++; detail = next; state = initialReviewAnswerState(); emit(); },
    dispose() { disposed = true; generation++; },
  };
}
