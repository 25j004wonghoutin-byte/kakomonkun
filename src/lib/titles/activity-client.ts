type ActivityBody = { navigation?: { tabId: string; sequence: number; path: string } };
type Options = {
  storage: Pick<Storage, "getItem" | "setItem">;
  uuid: () => string;
  isVisible: () => boolean;
  date: () => string;
  send: (body: ActivityBody) => Promise<{ date: string }>;
  claimTabId?: (tabId: string) => Promise<boolean>;
  reuseSavedState?: boolean;
};
type QueuedEvent = { body: ActivityBody; date: string };
type ClientState = { tabId: string; sequence: number; lastPath: string | null; lastDate: string | null; queue: QueuedEvent[] };
const storageKey = "kakomonkun:title-activity:v1";

/** 生きている別タブのIDは再利用しない。document終了時はブラウザーが解放する。 */
export function createTitleTabClaim(locks: Pick<LockManager, "request">) {
  return (tabId: string) => new Promise<boolean>((resolve) => {
    void locks.request(`kakomonkun:title-tab:${tabId}`, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      if (lock) return new Promise<void>(() => { /* Hold for this document's lifetime. */ });
    }).catch(() => resolve(false));
  });
}

export function createTitleActivityClient(options: Options) {
  const fresh = (): ClientState => ({ tabId: options.uuid(), sequence: 0, lastPath: null, lastDate: null, queue: [] });
  let state = fresh();
  try {
    const saved = JSON.parse(options.storage.getItem(storageKey) ?? "null") as (ClientState & { pending?: ActivityBody }) | null;
    if (options.reuseSavedState !== false && saved && typeof saved.tabId === "string" && saved.tabId.length <= 100 && Number.isSafeInteger(saved.sequence) && saved.sequence >= 0) {
      state = { ...saved, queue: Array.isArray(saved.queue) ? saved.queue : saved.pending ? [{ body: saved.pending, date: options.date() }] : [] };
    }
  } catch { /* Storageが使えなくても表示や学習は継続できる。 */ }
  const persist = () => { try { options.storage.setItem(storageKey, JSON.stringify(state)); } catch { /* best effort */ } };
  const ready = (async () => {
    if (options.claimTabId && !await options.claimTabId(state.tabId).catch(() => false)) {
      // sessionStorageの複製は部分往復・未送信イベントまで引き継いではいけない。
      state = fresh(); persist();
      await options.claimTabId(state.tabId).catch(() => false);
    }
  })();
  let inFlight: Promise<void> | null = null;

  function drain(): Promise<void> {
    if (inFlight) return inFlight;
    let failed = false;
    inFlight = (async () => {
      while (state.queue.length > 0) {
        try {
          const result = await options.send(state.queue[0].body);
          state.lastDate = result.date;
          state.queue.shift(); persist();
        } catch { failed = true; break; /* 次の実操作で先頭から再送する。隠れたポーリングはしない。 */ }
      }
    })().finally(() => {
      inFlight = null;
      if (!failed && state.queue.length > 0) return drain();
    });
    return inFlight;
  }

  async function visit(path: string, force = false): Promise<void> {
    if (!options.isVisible()) return Promise.resolve();
    await ready;
    if (!options.isVisible()) return;
    const date = options.date();
    let body: ActivityBody = {};
    if (path !== state.lastPath) {
      state.sequence++;
      state.lastPath = path;
      body = { navigation: { tabId: state.tabId, sequence: state.sequence, path } };
    } else {
      if (state.queue.at(-1)?.date === date) return drain();
      if (!force && date === state.lastDate && state.queue.length === 0) return;
    }
    state.queue.push({ body, date });
    persist();
    return drain();
  }
  return { visit, input: (path: string) => visit(path) };
}
