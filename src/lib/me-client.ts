import type { MePayload } from "@/lib/me";

export function createMeLoader(deps: {
  fetchMe(signal: AbortSignal): Promise<MePayload>;
  onData(value: MePayload | null): void;
  onError(message: string): void;
  onLoading(value: boolean): void;
}) {
  let generation = 0;
  let disposed = false;
  let controller: AbortController | null = null;
  return {
    async load() {
      if (disposed) return;
      const request = ++generation;
      controller?.abort();
      controller = new AbortController();
      deps.onLoading(true);
      deps.onError("");
      try {
        const data = await deps.fetchMe(controller.signal);
        if (!disposed && request === generation) deps.onData(data);
      } catch {
        if (!disposed && request === generation) {
          deps.onData(null);
          deps.onError("学習情報を読み込めませんでした。再試行してください。");
        }
      } finally {
        if (!disposed && request === generation) deps.onLoading(false);
      }
    },
    dispose() { disposed = true; generation++; controller?.abort(); },
  };
}

export function mergeMePoints(current: MePayload | null, totalPoints: number): MePayload | null {
  return current?.profile ? { ...current, profile: { ...current.profile, totalPoints } } : current;
}

export function observeMeRefresh(
  refresh: () => void,
  windowTarget: EventTarget,
  documentTarget: EventTarget & { readonly visibilityState: string },
) {
  const visible = () => { if (documentTarget.visibilityState === "visible") refresh(); };
  windowTarget.addEventListener("pageshow", refresh);
  documentTarget.addEventListener("visibilitychange", visible);
  return () => {
    windowTarget.removeEventListener("pageshow", refresh);
    documentTarget.removeEventListener("visibilitychange", visible);
  };
}
