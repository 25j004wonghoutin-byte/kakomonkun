export async function readReviewIdentity(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string | null> {
  const response = await fetcher("/api/me", { cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Session verification failed");
  const value = await response.json();
  return value.role === "student" && typeof value.id === "string" ? value.id : null;
}

export function createReviewSessionGuard(deps: {
  ownerId: string;
  readIdentity(signal: AbortSignal): Promise<string | null>;
  onInvalidate(): void;
  onRestore(): void;
  onMismatch(): void;
}) {
  let generation = 0, disposed = false, blocked = false;
  const requests = new Set<AbortController>();
  const abortError = () => Object.assign(new Error("Private view invalidated"), { name: "AbortError" });
  const cancel = () => { generation++; for (const request of requests) request.abort(); requests.clear(); };
  const invalidate = () => { if (disposed) return; blocked = true; cancel(); deps.onInvalidate(); };
  const guard = {
    async run<T>(read: (signal: AbortSignal) => Promise<T>, outerSignal?: AbortSignal): Promise<T> {
      if (disposed || blocked || outerSignal?.aborted) throw abortError();
      const request = new AbortController(), current = generation;
      const abort = () => request.abort();
      outerSignal?.addEventListener("abort", abort, { once: true }); requests.add(request);
      const assertCurrent = () => { if (disposed || blocked || current !== generation || request.signal.aborted) throw abortError(); };
      try {
        const value = await read(request.signal);
        assertCurrent();
        const identity = await deps.readIdentity(request.signal);
        assertCurrent();
        if (identity !== deps.ownerId) {
          invalidate(); deps.onMismatch();
          throw Object.assign(new Error("Account changed"), { status: 401 });
        }
        return value;
      } finally { requests.delete(request); outerSignal?.removeEventListener("abort", abort); }
    },
    observe(windowTarget: EventTarget, documentTarget: EventTarget & { readonly visibilityState: string }) {
      // React may attach effects again after a cleanup; old generations remain invalid.
      disposed = false; blocked = false; generation++;
      const restore = () => { if (!disposed && documentTarget.visibilityState === "visible") { invalidate(); blocked = false; deps.onRestore(); } };
      const visible = () => { if (documentTarget.visibilityState === "visible") restore(); else invalidate(); };
      windowTarget.addEventListener("blur", invalidate); windowTarget.addEventListener("pagehide", invalidate);
      windowTarget.addEventListener("focus", restore); windowTarget.addEventListener("pageshow", restore);
      documentTarget.addEventListener("visibilitychange", visible);
      return () => {
        windowTarget.removeEventListener("blur", invalidate); windowTarget.removeEventListener("pagehide", invalidate);
        windowTarget.removeEventListener("focus", restore); windowTarget.removeEventListener("pageshow", restore);
        documentTarget.removeEventListener("visibilitychange", visible); guard.dispose();
      };
    },
    dispose() { disposed = true; blocked = true; cancel(); },
  };
  return guard;
}
