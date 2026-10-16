import { clampAvatarCrop, INITIAL_AVATAR_CROP, type CropState } from "@/lib/avatars/crop";
import type { PreparedAvatar } from "./avatar-image";

type Options = {
  currentAvatarUrl: string | null;
  onSaved(value: string | null): void;
  onClose(): void;
  prepareSource(file: File): Promise<PreparedAvatar>;
  encodeCrop(source: PreparedAvatar, crop: CropState): Promise<Blob>;
  fetcher?: typeof fetch;
};
type EditorState = {
  source: PreparedAvatar | null; crop: CropState; expectedAvatarUrl: string | null;
  busy: boolean; loading: boolean; needsRefresh: boolean; confirmDelete: boolean; error: string;
};

export function createAvatarEditorController(options: Options) {
  const fetcher = options.fetcher ?? fetch;
  let state: EditorState = { source: null, crop: INITIAL_AVATAR_CROP, expectedAvatarUrl: options.currentAvatarUrl, busy: false, loading: false, needsRefresh: false, confirmDelete: false, error: "" };
  let generation = 0, disposed = false;
  const listeners = new Set<() => void>();
  const set = (change: Partial<EditorState>) => { if (!disposed) { state = { ...state, ...change }; listeners.forEach(fn => fn()); } };
  function dispose() { if (!disposed) { disposed = true; generation++; state.source?.dispose(); listeners.clear(); } }
  function close() { if (!state.busy) { dispose(); options.onClose(); } }
  async function sync() {
    const response = await fetcher("/api/me", { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("同期に失敗しました。");
    const data = await response.json();
    const avatarUrl = data?.profile?.avatarUrl;
    if (avatarUrl !== null && typeof avatarUrl !== "string") throw new Error("同期に失敗しました。");
    if (disposed) return;
    set({ expectedAvatarUrl: avatarUrl, needsRefresh: false });
    options.onSaved(avatarUrl);
  }
  async function mutate(deleting: boolean) {
    if (state.busy || state.loading || state.needsRefresh || (!deleting && !state.source)) return;
    const source = state.source, crop = state.crop, expected = state.expectedAvatarUrl;
    set({ busy: true, error: "" });
    let sent = false;
    try {
      let body: BodyInit;
      if (deleting) body = JSON.stringify({ expectedAvatarUrl: expected });
      else {
        const image = await options.encodeCrop(source!, crop);
        const form = new FormData(); form.set("image", image, "avatar.webp"); form.set("expectedAvatarUrl", JSON.stringify(expected)); body = form;
      }
      sent = true;
      const response = await fetcher("/api/profile/avatar", {
        method: deleting ? "DELETE" : "POST", body, signal: AbortSignal.timeout(30_000),
        ...(deleting ? { headers: { "Content-Type": "application/json" } } : {}),
      });
      if (response.status === 409) {
        set({ needsRefresh: true }); await sync();
        set({ error: "別の操作でアイコンが更新されました。確認して再度操作してください。", confirmDelete: false });
        return;
      }
      if (response.status >= 500) throw new Error("保存結果を確認できませんでした。");
      const data = await response.json();
      if (!response.ok) { sent = false; throw new Error(typeof data.error === "string" ? data.error : "保存できませんでした。"); }
      if (data.avatarUrl !== null && typeof data.avatarUrl !== "string") throw new Error("保存結果を確認できませんでした。");
      if (disposed) return;
      options.onSaved(data.avatarUrl);
      set({ busy: false }); close();
    } catch (cause) {
      if (disposed) return;
      if (sent) {
        set({ needsRefresh: true });
        try { await sync(); set({ error: "現在のアイコンを再確認しました。必要な場合はもう一度操作してください。" }); }
        catch { set({ error: "保存結果を確認できません。接続を確認して「最新の状態を確認」を押してください。" }); }
      } else set({ error: cause instanceof Error ? cause.message : "画像を処理できませんでした。" });
    } finally { set({ busy: false }); }
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async choose(file: File) {
      if (state.busy || disposed) return;
      const sequence = ++generation;
      state.source?.dispose(); set({ source: null, crop: INITIAL_AVATAR_CROP, loading: true, confirmDelete: false, error: "" });
      try {
        const source = await options.prepareSource(file);
        if (disposed || sequence !== generation) { source.dispose(); return; }
        set({ source, loading: false });
      } catch (cause) { if (sequence === generation) set({ loading: false, error: cause instanceof Error ? cause.message : "画像を読み込めませんでした。" }); }
    },
    move(crop: CropState) { if (!state.busy && state.source) set({ crop: clampAvatarCrop(state.source.width, state.source.height, crop) }); },
    save: () => mutate(false),
    requestDelete() { if (!state.busy && !state.needsRefresh && state.expectedAvatarUrl !== null) set({ confirmDelete: true }); },
    cancelDelete() { if (!state.busy) set({ confirmDelete: false }); },
    confirmDelete: () => state.confirmDelete ? mutate(true) : Promise.resolve(),
    async refresh() {
      if (state.busy) return;
      set({ busy: true });
      try { await sync(); set({ error: "最新の状態を確認しました。必要な場合はもう一度操作してください。" }); }
      catch { set({ error: "接続を確認して、もう一度お試しください。" }); }
      finally { set({ busy: false }); }
    },
    close, dispose,
  };
}
