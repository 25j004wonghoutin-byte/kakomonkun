"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createReviewAnswerController, initialReviewAnswerState, mergeCurrentReviewStatus } from "@/lib/review-notebook/answer-controller";
import { buildReviewListHref, parseReviewQuery } from "@/lib/review-notebook/request";
import type { ReviewAnswerResult, ReviewDetail } from "@/lib/review-notebook/contract";
import { createReviewSessionGuard, readReviewIdentity } from "@/lib/review-notebook/session-guard";
import { ReviewQuestionView } from "./review-question-view";

async function readDetail(itemId: string, signal: AbortSignal): Promise<ReviewDetail> {
  const response = await fetch(`/api/review-notebook/${itemId}`, { cache: "no-store", signal });
  if (!response.ok) throw Object.assign(new Error("detail failed"), { status: response.status });
  return response.json();
}
export function ReviewQuestionClient({ itemId, ownerId }: { itemId: string; ownerId: string }) {
  const router = useRouter(), params = useSearchParams(), key = params.toString();
  const backHref = useMemo(() => { try { return buildReviewListHref(parseReviewQuery(new URLSearchParams(key))); } catch { return "/review-notebook"; } }, [key]);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [state, setState] = useState(initialReviewAnswerState);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<ReturnType<typeof createReviewAnswerController> | null>(null);
  useEffect(() => {
    let active = true, refreshed = false;
    const abort = new AbortController();
    const session = createReviewSessionGuard({ ownerId, readIdentity: readReviewIdentity,
      onInvalidate: () => { controller.current?.dispose(); controller.current = null; setDetail(null); setSelectedChoiceId(null); setState(initialReviewAnswerState()); },
      onRestore: () => setAttempt(value => value + 1), onMismatch: () => router.refresh(),
    });
    const stop = session.observe(window, document);
    const failedRead = (cause: unknown, saved = false) => {
      if (!active || cause && typeof cause === "object" && "name" in cause && cause.name === "AbortError") return;
      const status = cause && typeof cause === "object" && "status" in cause ? cause.status : 0;
      if (status === 401 || status === 403 || status === 404) { controller.current?.dispose(); setDetail(null); }
      setState(current => ({ ...current, result: status === 401 || status === 403 || status === 404 ? null : current.result, requiresLogin: status === 401, unavailable: status === 403 || status === 404, requiresReload: saved, error: saved ? "回答は保存しましたが、最新の復習状況を取得できませんでした。再読み込みしてください。" : "問題を読み込めませんでした。再読み込みしてください。" }));
    };
    void session.run(signal => readDetail(itemId, signal), abort.signal).then(value => {
      if (!active) return;
      setDetail(value);
      controller.current = createReviewAnswerController({
        detail: value, newId: () => crypto.randomUUID(),
        send: (id, input) => session.run(async signal => {
          const response = await fetch(`/api/review-notebook/${id}/answers`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
          if (!response.ok) throw Object.assign(new Error("answer failed"), { status: response.status });
          return response.json() as Promise<ReviewAnswerResult>;
        }, abort.signal),
        onState: next => {
          if (!active) return;
          setState(next);
          if (next.result && !refreshed) {
            refreshed = true;
            void session.run(signal => readDetail(itemId, signal), abort.signal).then(current => { if (active) setDetail(answered => answered ? mergeCurrentReviewStatus(answered, current) : null); }).catch(cause => failedRead(cause, true));
          }
        },
      });
    }).catch(cause => failedRead(cause));
    return () => { active = false; stop(); abort.abort(); controller.current?.dispose(); controller.current = null; };
  }, [itemId, attempt, ownerId, router]);
  const reset = () => { controller.current?.dispose(); setDetail(null); setSelectedChoiceId(null); setState(initialReviewAnswerState()); setAttempt(value => value + 1); };
  return <ReviewQuestionView detail={detail?.id === itemId ? detail : null} selectedChoiceId={selectedChoiceId} result={state.result} saving={state.saving} error={state.error} requiresReload={state.requiresReload} requiresLogin={state.requiresLogin} unavailable={state.unavailable}
    onSelect={choice => { if (!state.pending && !state.result) setSelectedChoiceId(choice); }} onSubmit={() => { if (selectedChoiceId) void controller.current?.submit(selectedChoiceId); }} onRetry={() => { void controller.current?.retry(); }} onReload={reset} onReset={reset} backHref={backHref} />;
}
