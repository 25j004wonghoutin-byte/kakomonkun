export type ReviewAiInput = { answerRevision: number; questionVersion: string };
export type ReviewAiResult = { explanation: string; fromCache: boolean };
export type ReviewAiState = {
  loading: boolean; result: ReviewAiResult | null; error: string;
  requiresReload: boolean; requiresLogin: boolean; unavailable: boolean;
};
export const initialReviewAiState = (): ReviewAiState => ({
  loading: false, result: null, error: "", requiresReload: false, requiresLogin: false, unavailable: false,
});
