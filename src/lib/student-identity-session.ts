import { createStudentIdentityStore } from "./student-identity-store";

export function createStudentIdentitySession(fetcher: typeof fetch = fetch) {
  let pending: Promise<Response> | null = null;
  let pendingOwner: string | undefined;
  const requestMe = (): Promise<Response> => {
    const owner = store.getSnapshot()?.id;
    if (!pending || pendingOwner !== owner) {
      const request = fetcher("/api/me", { cache: "no-store" }).then(async response => {
        await response.clone().arrayBuffer();
        if (response.status === 401 && store.getSnapshot()?.id === owner) store.clear();
        return response;
      }).finally(() => {
        if (pending === request) { pending = null; pendingOwner = undefined; }
      });
      pending = request;
      pendingOwner = owner;
    }
    return pending.then(response => response.clone());
  };
  const store = createStudentIdentityStore(async () => {
    const response = await requestMe();
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Identity unavailable");
    const data = await response.json();
    if (typeof data.id !== "string" || typeof data.displayName !== "string") throw new Error("Invalid identity");
    return { id: data.id, displayName: data.displayName, avatarUrl: data.profile?.avatarUrl ?? null, titleName: data.profile?.currentTitleName ?? null };
  });
  return { store, requestMe };
}
export type StudentIdentitySession = ReturnType<typeof createStudentIdentitySession>;
