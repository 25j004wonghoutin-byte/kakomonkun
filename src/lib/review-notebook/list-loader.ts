import type { ReviewList, ReviewQuery } from "./contract";
export type ReviewLoadError = { status: number; message: string };
export function createReviewListLoader(deps: {
  fetchList(query: ReviewQuery, signal: AbortSignal): Promise<ReviewList>;
  onData(value: ReviewList | null): void;
  onError(value: ReviewLoadError | null): void;
  onLoading(value: boolean): void;
}) {
  let generation = 0, disposed = false;
  let controller: AbortController | null = null;
  return {
    async load(query: ReviewQuery) {
      if (disposed) return;
      const current = ++generation; controller?.abort(); controller = new AbortController();
      deps.onData(null); deps.onError(null); deps.onLoading(true);
      try {
        const data = await deps.fetchList(query, controller.signal);
        if (!disposed && current === generation) deps.onData(data);
      } catch (cause) {
        if (!disposed && current === generation) {
          const status = cause && typeof cause === "object" && "status" in cause && typeof cause.status === "number" ? cause.status : 0;
          deps.onData(null);
          deps.onError({ status, message: status === 401 ? "ログインし直してください。" : "復習ノートを読み込めませんでした。再試行してください。" });
        }
      } finally { if (!disposed && current === generation) deps.onLoading(false); }
    },
    dispose() { disposed = true; generation++; controller?.abort(); },
  };
}
