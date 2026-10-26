import type { MePayload } from "@/lib/me";

export function HomeStudyTotals({ profile, loading, error, onRetry }: {
  profile: MePayload["profile"];
  loading: boolean;
  error: string;
  onRetry(): void;
}) {
  const accuracy = profile?.totalAnswerCount
    ? Math.round(profile.totalCorrectCount / profile.totalAnswerCount * 100) : null;
  return (
    <section className="study-totals" aria-labelledby="study-totals-heading" aria-busy={loading}>
      <h2 id="study-totals-heading">これまでの学習</h2>
      <dl>
        <div className="study-stat"><dt>所持ポイント</dt><dd>{profile ? `${profile.totalPoints.toLocaleString()} pt` : "—"}</dd></div>
        <div className="study-stat"><dt>回答数</dt><dd>{profile ? `${profile.totalAnswerCount.toLocaleString()} 問` : "—"}</dd></div>
        <div className="study-stat"><dt>正答率</dt><dd>{accuracy !== null ? `${accuracy}%` : "—"}</dd></div>
        <div className="study-stat"><dt>練習完了</dt><dd>{profile ? `${profile.totalPracticeCount.toLocaleString()} 回` : "—"}</dd></div>
        <div className="study-stat"><dt>所持称号</dt><dd>{profile && !error ? `${profile.ownedTitleCount.toLocaleString()} 個` : "— 個"}</dd></div>
      </dl>
      {error ? <div role="alert" className="mt-3 text-sm"><p>{error}</p><button type="button" onClick={onRetry} disabled={loading} className="mt-1 min-h-11 underline underline-offset-4 disabled:cursor-wait">再試行</button></div> : null}
    </section>
  );
}
