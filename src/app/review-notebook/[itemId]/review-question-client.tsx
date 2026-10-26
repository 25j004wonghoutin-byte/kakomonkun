"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createReviewAnswerController, initialReviewAnswerState } from "@/lib/review-notebook/answer-controller";
import { buildReviewListHref, parseReviewQuery } from "@/lib/review-notebook/request";
import type { ReviewAnswerResult, ReviewDetail } from "@/lib/review-notebook/contract";
import { ReviewQuestionView } from "./review-question-view";

async function readDetail(itemId: string, signal: AbortSignal): Promise<ReviewDetail> {
  const response = await fetch(`/api/review-notebook/${itemId}`, { cache: "no-store", signal });
  if (!response.ok) throw Object.assign(new Error("detail failed"), { status: response.status });
  return response.json();
}
export function ReviewQuestionClient({ itemId }: { itemId: string }) {
  const params = useSearchParams(), key = params.toString();
  const backHref = useMemo(() => { try { return buildReviewListHref(parseReviewQuery(new URLSearchParams(key))); } catch { return "/review-notebook"; } }, [key]);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [state, setState] = useState(initialReviewAnswerState);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<ReturnType<typeof createReviewAnswerController> | null>(null);
  useEffect(() => {
    let active = true, refreshed = false;
    const abort = new AbortController();
    const failedRead = (cause: unknown, saved = false) => {
      if (!active) return;
      const status = cause && typeof cause === "object" && "status" in cause ? cause.status : 0;
      if (status === 401 || status === 403 || status === 404) { controller.current?.dispose(); setDetail(null); }
      setState(current => ({ ...current, result: status === 401 || status === 403 || status === 404 ? null : current.result, requiresLogin: status === 401, unavailable: status === 403 || status === 404, requiresReload: saved, error: saved ? "回答は保存しましたが、最新の復習状況を取得できませんでした。再読み込みしてください。" : "問題を読み込めませんでした。再読み込みしてください。" }));
    };
    void readDetail(itemId, abort.signal).then(value => {
      if (!active) return;
      setDetail(value);
      controller.current = createReviewAnswerController({
        detail: value, newId: () => crypto.randomUUID(),
        send: async (id, input) => {
          const response = await fetch(`/api/review-notebook/${id}/answers`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: abort.signal });
          if (!response.ok) throw Object.assign(new Error("answer failed"), { status: response.status });
          return response.json() as Promise<ReviewAnswerResult>;
        },
        onState: next => {
          if (!active) return;
          setState(next);
          if (next.result && !refreshed) {
            refreshed = true;
            void readDetail(itemId, abort.signal).then(current => { if (active) setDetail(current); }).catch(cause => failedRead(cause, true));
          }
        },
      });
    }).catch(cause => failedRead(cause));
    return () => { active = false; abort.abort(); controller.current?.dispose(); controller.current = null; };
  }, [itemId, attempt]);
  const reset = () => { controller.current?.dispose(); setDetail(null); setSelectedChoiceId(null); setState(initialReviewAnswerState()); setAttempt(value => value + 1); };
  return <ReviewQuestionView detail={detail?.id === itemId ? detail : null} selectedChoiceId={selectedChoiceId} result={state.result} saving={state.saving} error={state.error} requiresReload={state.requiresReload} requiresLogin={state.requiresLogin} unavailable={state.unavailable}
    onSelect={choice => { if (!state.pending && !state.result) setSelectedChoiceId(choice); }} onSubmit={() => { if (selectedChoiceId) void controller.current?.submit(selectedChoiceId); }} onRetry={() => { void controller.current?.retry(); }} onReload={reset} onReset={reset} backHref={backHref} />;
}
