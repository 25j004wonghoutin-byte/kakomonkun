"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createStudentIdentitySession, type StudentIdentitySession } from "@/lib/student-identity-session";

const IdentityContext = createContext<StudentIdentitySession | null>(null);
export function StudentIdentityProvider({ children }: { children: ReactNode }) {
  const [session] = useState(createStudentIdentitySession);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void session.store.load(true); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [session]);
  return <IdentityContext.Provider value={session}>{children}</IdentityContext.Provider>;
}
function useStudentIdentitySession() {
  const context = useContext(IdentityContext);
  const [fallback] = useState(createStudentIdentitySession);
  return context ?? fallback;
}
export function useStudentIdentityStore() { return useStudentIdentitySession().store; }
export function useStudentMeRequest() { return useStudentIdentitySession().requestMe; }
export function useRememberedStudentIdentity() {
  const store = useStudentIdentityStore();
  return { store, identity: useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot), signedOut: useSyncExternalStore(store.subscribe, store.isSignedOut, () => false) };
}
