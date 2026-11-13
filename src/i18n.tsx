import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { translate, type Language } from "./messages";
export type { MessageValues } from "./messages";

const preferenceKey = "planform.language";
const LanguageContext = createContext<Language>("en");
const SetLanguageContext = createContext<(language: Language) => void>(
  () => {},
);

export function LanguageScope({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  return (
    <LanguageContext.Provider value={language}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useTranslation() {
  return translate(useLanguage());
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem(preferenceKey) === "nb" ? "nb" : "en";
    } catch {
      return "en";
    }
  });
  const t = translate(language);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("Planform · Floor plan studio");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        t(
          "Planform — a private, browser-based floor plan editor for your next renovation.",
        ),
      );
  }, [language, t]);

  return (
    <SetLanguageContext.Provider value={setLanguage}>
      <LanguageScope language={language}>{children}</LanguageScope>
    </SetLanguageContext.Provider>
  );
}

export function LanguagePicker() {
  const language = useLanguage();
  const setLanguage = useContext(SetLanguageContext);
  const t = useTranslation();
  return (
    <select
      className="language-picker"
      aria-label={t("Language")}
      title={t("Language")}
      value={language}
      onChange={(event) => {
        const next = event.target.value === "nb" ? "nb" : "en";
        setLanguage(next);
        try {
          localStorage.setItem(preferenceKey, next);
        } catch {
          // The choice still applies for the current session.
        }
      }}
    >
      <option value="en" lang="en">
        English
      </option>
      <option value="nb" lang="nb">
        Norsk bokmål
      </option>
    </select>
  );
}
