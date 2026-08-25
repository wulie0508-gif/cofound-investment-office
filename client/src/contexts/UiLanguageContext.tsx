import type { UiLanguagePreference } from "@shared/collaboration";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "cofound-ui-language";
const LANGUAGE_SWITCH_ENABLED = false;

type UiLanguageContextValue = {
  preference: UiLanguagePreference;
  setPreference: (value: UiLanguagePreference) => void;
  copy: (chinese: string, english: string) => string;
};

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

function initialPreference(): UiLanguagePreference {
  if (!LANGUAGE_SWITCH_ENABLED) return "bilingual";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "zh-CN" || stored === "en" || stored === "bilingual"
    ? stored
    : "bilingual";
}

export function UiLanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] =
    useState<UiLanguagePreference>(initialPreference);
  const setPreference = useCallback((value: UiLanguagePreference) => {
    const nextValue = LANGUAGE_SWITCH_ENABLED ? value : "bilingual";
    window.localStorage.setItem(STORAGE_KEY, nextValue);
    setPreferenceState(nextValue);
  }, []);
  const copy = useCallback(
    (chinese: string, english: string) => {
      if (preference === "zh-CN") return chinese;
      if (preference === "en") return english;
      return `${chinese} / ${english}`;
    },
    [preference]
  );

  useEffect(() => {
    document.documentElement.lang = preference === "en" ? "en" : "zh-CN";
  }, [preference]);

  const value = useMemo(
    () => ({ preference, setPreference, copy }),
    [copy, preference, setPreference]
  );
  return (
    <UiLanguageContext.Provider value={value}>
      {children}
    </UiLanguageContext.Provider>
  );
}

export function useUiLanguage() {
  const value = useContext(UiLanguageContext);
  if (!value)
    throw new Error("useUiLanguage must be used within UiLanguageProvider");
  return value;
}
