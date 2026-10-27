"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReviewList, ReviewQuery } from "@/lib/review-notebook/contract";
import { createReviewListLoader, type ReviewLoadError } from "@/lib/review-notebook/list-loader";
import { buildReviewListHref, parseReviewQuery } from "@/lib/review-notebook/request";
import { createReviewSessionGuard, readReviewIdentity } from "@/lib/review-notebook/session-guard";
import { ReviewNotebookListView } from "./review-notebook-view";

export function ReviewNotebookClient({ ownerId }: { ownerId: string }) {
  const router = useRouter(), params = useSearchParams();
  const key = params.toString();
  const parsed = useMemo(() => {
    try { return { query: parseReviewQuery(new URLSearchParams(key)), error: null }; }
    catch { return { query: parseReviewQuery(new URLSearchParams()), error: { status: 400, message: "絞り込み条件が不正です。絞り込みを解除してください。" } }; }
  }, [key]);
  const [data, setData] = useState<{ key: string; value: ReviewList } | null>(null);
  const [error, setError] = useState<ReviewLoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (parsed.error) return;
    const session = createReviewSessionGuard({ ownerId, readIdentity: readReviewIdentity,
      onInvalidate: () => { loader.dispose(); setData(null); setError(null); setLoading(true); },
      onRestore: () => setRetry(value => value + 1), onMismatch: () => router.refresh(),
    });
    const loader = createReviewListLoader({
      fetchList: (query, signal) => session.run(async requestSignal => {
        const response = await fetch(buildReviewListHref(query).replace("/review-notebook", "/api/review-notebook"), { signal: requestSignal, cache: "no-store" });
        if (!response.ok) throw Object.assign(new Error("review list failed"), { status: response.status });
        return response.json() as Promise<ReviewList>;
      }, signal),
      onData: value => {
        setData(value ? { key, value } : null);
        if (value && value.query.page !== parsed.query.page) router.replace(buildReviewListHref(value.query), { scroll: false });
      },
      onError: setError, onLoading: setLoading,
    });
    const stop = session.observe(window, document); void loader.load(parsed.query);
    return () => { stop(); loader.dispose(); };
  }, [key, parsed, retry, router, ownerId]);
  const changeQuery = (query: ReviewQuery) => router.push(buildReviewListHref(query), { scroll: false });
  return <ReviewNotebookListView data={data?.key === key ? data.value : null} query={parsed.query} loading={!parsed.error && loading} error={parsed.error ?? error} onQueryChange={changeQuery} onRetry={() => setRetry(value => value + 1)} />;
}
