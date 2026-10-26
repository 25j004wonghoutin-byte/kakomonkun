import Link from "next/link";
import { QuizQuestionCard } from "@/components/quiz-question-card";
import { REVIEW_STATUS_LABELS, type ReviewDetail, type ReviewAnswerResult } from "@/lib/review-notebook/contract";

export function ReviewQuestionView(props: {
  detail: ReviewDetail | null; selectedChoiceId: string | null; result: ReviewAnswerResult | null;
  saving: boolean; error: string; requiresReload: boolean; requiresLogin: boolean; unavailable: boolean;
  onSelect(choiceId: string): void; onSubmit(): void; onRetry(): void; onReload(): void; onReset(): void; backHref: string;
}) {
  const { detail, result, requiresLogin, unavailable, requiresReload, error } = props;
  return <div className="review-notebook">
    <div className="review-actions"><Link className="review-text-action" href={props.backHref}>一覧へ戻る</Link></div>
    {requiresLogin || unavailable ? <div className="review-message" role="alert"><p>{requiresLogin ? "ログインし直してください。" : "この問題は利用できません。"}</p>{requiresLogin ? <Link className="review-button" href="/login">ログインへ</Link> : <Link className="review-button" href={props.backHref}>一覧へ戻る</Link>}</div> : <>
      <p className="review-notice">復習はポイントや通常の成績に加算されません。</p>
      {detail ? <p className="review-notice" role="status">{REVIEW_STATUS_LABELS[detail.status]}{detail.status === "reviewed" ? " · 直近の解き直しで正解した問題です。" : ""}</p> : null}
      <QuizQuestionCard title="解き直し" description="" question={detail?.question ?? null} selectedChoiceId={props.selectedChoiceId}
        answerResult={result ? { ...result.answer, explanation: result.answer.explanation?.trim() ? result.answer.explanation : "解説は未登録です。" } : null}
        loading={!detail && !error} answering={props.saving || requiresReload || Boolean(error)} error=""
        onSelectChoice={props.onSelect} onSubmit={props.onSubmit}
        resultActions={<div className="review-actions"><Link className="review-button" href={props.backHref}>一覧へ戻る</Link><button type="button" className="review-button" onClick={props.onReset}>もう一度解く</button></div>} />
      {error ? <div className="review-message" role="alert"><p>{error}</p><button type="button" className="review-button" onClick={requiresReload || !detail ? props.onReload : props.onRetry}>{requiresReload || !detail ? "再読み込み" : "再試行"}</button></div> : null}
    </>}
  </div>;
}
