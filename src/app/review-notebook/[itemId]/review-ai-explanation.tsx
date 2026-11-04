import { AiExplanationMarkdown } from "@/components/ai-explanation-markdown";
import type { ReviewAiState } from "@/lib/review-notebook/ai-contract";

export function ReviewAiExplanation({ state, onRequest, onReload }: { state: ReviewAiState; onRequest(): void; onReload(): void }) {
  return <section className="mt-5 rounded-md border border-blue-200 bg-blue-50 p-4" aria-label="AI解説">
    {state.result ? <>
      <h2 className="text-sm font-black text-blue-800">AI解説</h2>
      <div className="mt-3"><AiExplanationMarkdown text={state.result.explanation} /></div>
      <p className="mt-3 text-xs leading-5 text-slate-600">AIによる解説です。内容が正確でない場合があります。</p>
    </> : <>
      {state.error ? <p className="mb-3 text-sm font-bold text-rose-700" role="alert">{state.error}</p> : null}
      {state.loading ? <p className="mb-3 text-sm font-bold text-slate-700" role="status">AI解説を生成しています...</p> : null}
      <button type="button" className="review-button" disabled={state.loading} onClick={state.requiresReload ? onReload : onRequest}>
        {state.requiresReload ? "再読み込み" : state.loading ? "AI解説を生成しています..." : state.error ? "AI解説を再試行" : "AI解説を見る"}
      </button>
    </>}
  </section>;
}
