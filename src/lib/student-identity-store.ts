import type { StudentIdentity } from "./me";

export function createStudentIdentityStore(fetchIdentity: () => Promise<StudentIdentity | null>) {
  let value: StudentIdentity | null = null;
  let revision = 0;
  let signedOut = false;
  let pending: Promise<StudentIdentity | null> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const remember = (next: StudentIdentity) => {
    if (signedOut) return;
    const merged = { ...next, ...(next.titleName === undefined && value?.id === next.id ? { titleName: value.titleName } : {}) };
    if (value?.id === merged.id && value.displayName === merged.displayName && value.avatarUrl === merged.avatarUrl && value.titleName === merged.titleName) return;
    revision++;
    value = merged;
    notify();
  };
  const seed = (next: StudentIdentity) => {
    if (!value || value.id !== next.id) remember(next);
    else if (value.titleName === undefined && next.titleName !== undefined) remember({ ...value, titleName: next.titleName });
  };
  const clear = () => {
    signedOut = true;
    revision++;
    value = null;
    notify();
  };
  const load = (force = false): Promise<StudentIdentity | null> => {
    if (signedOut) return Promise.resolve(null);
    if (pending) return pending;
    if (!force && value && value.titleName !== undefined) return Promise.resolve(value);
    const startedRevision = revision;
    let request: Promise<StudentIdentity | null>;
    try { request = fetchIdentity(); } catch { return Promise.resolve(value); }
    let superseded = false;
    pending = Promise.resolve(request).then(next => {
      superseded = revision !== startedRevision;
      if (!superseded) {
        if (next) remember(next);
        else clear();
      }
      return value;
    }).catch(error => {
      if (revision === startedRevision && error?.status === 401) clear();
      return value;
    }).finally(() => {
      pending = null;
      if (superseded && value && value.titleName === undefined && !signedOut) void load();
    });
    return pending;
  };
  return {
    getSnapshot: () => value,
    isSignedOut: () => signedOut,
    getServerSnapshot: () => null,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    remember, seed, load, clear,
  };
}
export type StudentIdentityStore = ReturnType<typeof createStudentIdentityStore>;
