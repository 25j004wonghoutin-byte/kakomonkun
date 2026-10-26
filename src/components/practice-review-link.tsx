import Link from "next/link";
import { buildReviewListHref } from "@/lib/review-notebook/request";
export function PracticeReviewLink({ sessionId, reviewNotebookCount }: { sessionId: string; reviewNotebookCount: number | null | undefined }) {
  if (!reviewNotebookCount || reviewNotebookCount < 0) return null;
  const href = buildReviewListHref({ status: "all", examCode: null, categoryCode: null, sessionId, page: 1 });
  return <Link href={href} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-6 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100">今回間違えた問題を復習</Link>;
}
