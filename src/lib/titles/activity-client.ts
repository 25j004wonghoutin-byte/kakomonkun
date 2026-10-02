type ActivityBody = { navigation?: { tabId: string; sequence: number; path: string } };
type Options = {
  storage: Pick<Storage, "getItem" | "setItem">;
  uuid: () => string;
  isVisible: () => boolean;
  date: () => string;
  send: (body: ActivityBody) => Promise<{ date: string }>;
};
type ClientState = { tabId: string; sequence: number; lastPath: string | null; lastDate: string | null; pending: ActivityBody | null };
const storageKey = "kakomonkun:title-activity:v1";

export function createTitleActivityClient(options: Options) {
  let state: ClientState = { tabId: options.uuid(), sequence: 0, lastPath: null, lastDate: null, pending: null };
  try {
    const saved = JSON.parse(options.storage.getItem(storageKey) ?? "null") as ClientState | null;
    if (saved && typeof saved.tabId === "string" && saved.tabId.length <= 100 && Number.isSafeInteger(saved.sequence) && saved.sequence >= 0) state = saved;
  } catch { /* Storageが使えなくても表示や学習は継続できる。 */ }
  const persist = () => { try { options.storage.setItem(storageKey, JSON.stringify(state)); } catch { /* best effort */ } };
  let inFlight: Promise<void> | null = null;
  let inFlightPath: string | null = null;
  let generation = 0;

  function visit(path: string, force = false): Promise<void> {
    if (!options.isVisible()) return Promise.resolve();
    if (inFlight && inFlightPath === path) return inFlight;
    if (!force && path === state.lastPath && options.date() === state.lastDate && !state.pending) return Promise.resolve();
    let body: ActivityBody = state.pending ?? {};
    if (path !== state.lastPath) {
      state.sequence++;
      state.lastPath = path;
      body = { navigation: { tabId: state.tabId, sequence: state.sequence, path } };
    }
    state.pending = body;
    persist();
    const current = ++generation;
    inFlightPath = path;
    inFlight = (async () => {
      try {
        const result = await options.send(body);
        if (current === generation) { state.lastDate = result.date; state.pending = null; persist(); }
      } catch { /* 次の実操作で同じIDを再送する。隠れた再試行ポーリングはしない。 */ }
      finally { if (current === generation) { inFlight = null; inFlightPath = null; } }
    })();
    return inFlight;
  }
  return { visit, input: (path: string) => visit(path) };
}
