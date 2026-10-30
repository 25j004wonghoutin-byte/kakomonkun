import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { PRACTICE_CATEGORIES } from "@/lib/practice-config";
import { REVIEW_STATUS_LABELS, type ReviewList, type ReviewQuery } from "@/lib/review-notebook/contract";
import type { ReviewLoadError } from "@/lib/review-notebook/list-loader";
import { buildReviewItemHref } from "@/lib/review-notebook/request";

const tabs = [{ value: "unfinished", label: "未完了" }, { value: "reviewed", label: "復習済み" }, { value: "all", label: "すべて" }] as const;
const dates = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
export function ReviewNotebookListView({ data, query, loading, error, onQueryChange, onRetry }: {
  data: ReviewList | null; query: ReviewQuery; loading: boolean; error: ReviewLoadError | null;
  onQueryChange(query: ReviewQuery): void; onRetry(): void;
}) {
  const filtered = Boolean(query.examCode || query.categoryCode || query.sessionId || query.status !== "unfinished");
  const pages = data ? Array.from({ length: Math.min(5, data.pageCount) }, (_, i) => Math.max(1, Math.min(query.page - 2, data.pageCount - 4)) + i) : [];
  return <div className="review-notebook">
    <PageHeading title="復習ノート" description="過去問練習で間違えた問題を復習できます。今日の一問・ランダム出題・模擬試験は対象外です。" />
    <div className="review-tabs" role="group" aria-label="復習状況">
      {tabs.map(tab => <button key={tab.value} type="button" aria-pressed={query.status === tab.value} onClick={() => onQueryChange({ ...query, status: tab.value, page: 1 })}>{tab.label}</button>)}
    </div>
    <div className="review-filters">
      <label>試験<select value={query.examCode ?? ""} onChange={event => onQueryChange({ ...query, examCode: event.target.value || null, page: 1 })}><option value="">すべての試験</option><option value="it_passport">ITパスポート</option><option value="fe">基本情報技術者</option></select></label>
      <label>分野<select value={query.categoryCode ?? ""} onChange={event => onQueryChange({ ...query, categoryCode: event.target.value || null, page: 1 })}><option value="">すべての分野</option>{PRACTICE_CATEGORIES.map(category => <option key={category.code} value={category.code}>{category.label}</option>)}</select></label>
      {query.sessionId ? <div className="review-scope"><span>今回の練習のみ</span><button type="button" className="review-text-action" onClick={() => onQueryChange({ ...query, sessionId: null, page: 1 })}>絞り込みを解除</button></div> : null}
    </div>
    {error ? <div className="review-message" role="alert"><p>{error.message}</p>{error.status === 401 ? <Link className="review-button" href="/login">ログインへ</Link> : <button className="review-button" type="button" onClick={onRetry}>再試行</button>}{error.status === 400 || error.status === 404 ? <button className="review-text-action" type="button" onClick={() => onQueryChange({ status: "unfinished", examCode: null, categoryCode: null, sessionId: null, page: 1 })}>絞り込みを解除</button> : null}</div> : loading ? <p className="review-message" role="status">読み込み中…</p> : data ? <>
      <p className="review-count" role="status">{data.total.toLocaleString()} 件</p>
      {data.items.length ? <ul className="review-items">{data.items.map(item => <li key={item.id} data-review-item={item.id}>
        <div className="review-item-content"><p className="review-meta">{item.exam.name} · {item.category.name}{item.sourceLabel ? <span>{item.sourceLabel}</span> : null}</p><p className="review-preview">{item.questionPreview}</p><p className="review-meta"><span>{REVIEW_STATUS_LABELS[item.status]}</span><time dateTime={item.lastWrongAt}>最終誤答 {dates.format(new Date(item.lastWrongAt))}</time></p></div>
        <Link href={buildReviewItemHref(item.id, query)} className="review-button" aria-label={`${item.questionPreview.slice(0, 25)}を解き直す`}>解き直す</Link>
      </li>)}</ul> : <div className="review-message"><p>{filtered ? "条件に一致する問題はありません。" : "過去問練習で間違えた問題がここに保存されます"}</p>{filtered ? <button className="review-button" type="button" onClick={() => onQueryChange({ status: "unfinished", examCode: null, categoryCode: null, sessionId: null, page: 1 })}>絞り込みを解除</button> : <Link className="review-button" href="/practice">過去問練習へ</Link>}</div>}
      {data.total > 0 ? <nav className="review-pagination" aria-label="復習ノートのページ"><button type="button" className="review-button" disabled={query.page <= 1} onClick={() => onQueryChange({ ...query, page: query.page - 1 })}>前のページ</button><div>{pages.map(page => <button key={page} type="button" className="review-page" aria-current={query.page === page ? "page" : undefined} onClick={() => onQueryChange({ ...query, page })}>{page}</button>)}</div><button type="button" className="review-button" disabled={query.page >= data.pageCount} onClick={() => onQueryChange({ ...query, page: query.page + 1 })}>次のページ</button></nav> : null}
    </> : null}
  </div>;
}
