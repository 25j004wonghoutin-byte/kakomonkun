"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { PracticeCategoryCode, PracticeQuestionCount } from "@/lib/practice-config";

export type PracticePreferences = {
  examCode: "it_passport" | "fe";
  categoryCode: PracticeCategoryCode;
  questionCount: PracticeQuestionCount;
};
type SidebarRole = "student" | "teacher";
type RememberedPractice = {
  getPracticePreferences(ownerId: string): PracticePreferences | undefined;
  rememberPracticePreferences(ownerId: string, value: PracticePreferences): void;
};
type StudyUiPreferences = RememberedPractice & {
  sidebars: Record<SidebarRole, boolean>;
  setSidebarVisible(role: SidebarRole, next: SetStateAction<boolean>): void;
};
const StudyUiContext = createContext<StudyUiPreferences | null>(null);
const emptyPracticeMemory: RememberedPractice = {
  getPracticePreferences: () => undefined,
  rememberPracticePreferences: () => undefined,
};

export function StudyUiPreferencesProvider({ children }: { children: ReactNode }) {
  const [sidebars, setSidebars] = useState({ student: true, teacher: true });
  // Tab-local UI choices only; no answers, credentials or persistent browser storage.
  const practice = useRef(new Map<string, PracticePreferences>());
  const getPracticePreferences = useCallback((ownerId: string) => practice.current.get(ownerId), []);
  const rememberPracticePreferences = useCallback((ownerId: string, value: PracticePreferences) => {
    if (ownerId) practice.current.set(ownerId, { ...value });
  }, []);
  const setSidebarVisible = useCallback((role: SidebarRole, next: SetStateAction<boolean>) => {
    setSidebars(current => ({ ...current, [role]: typeof next === "function" ? next(current[role]) : next }));
  }, []);
  const value = useMemo(() => ({ sidebars, setSidebarVisible, getPracticePreferences, rememberPracticePreferences }),
    [sidebars, setSidebarVisible, getPracticePreferences, rememberPracticePreferences]);
  return <StudyUiContext.Provider value={value}>{children}</StudyUiContext.Provider>;
}

export function useSidebarVisibility(role: SidebarRole): [boolean, Dispatch<SetStateAction<boolean>>] {
  const context = useContext(StudyUiContext);
  const [fallback, setFallback] = useState(true);
  return [
    context?.sidebars[role] ?? fallback,
    next => { if (context) context.setSidebarVisible(role, next); else setFallback(next); },
  ];
}

export function useRememberedPracticePreferences(): RememberedPractice {
  return useContext(StudyUiContext) ?? emptyPracticeMemory;
}
