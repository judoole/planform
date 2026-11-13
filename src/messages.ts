import bokmal from "./locales/nb.json";

export type Language = "en" | "nb";
export type MessageValues = Record<string, string | number>;
type Translate = (message: string, values?: MessageValues) => string;

const messages: Record<Language, Record<string, string>> = {
  en: {},
  nb: bokmal,
};

const translations = {
  en: translator("en"),
  nb: translator("nb"),
};

function translator(language: Language): Translate {
  const catalog = messages[language];
  return (message, values) => {
    const template = Object.hasOwn(catalog, message)
      ? catalog[message]
      : message;
    return values
      ? template.replace(/\{(\w+)\}/g, (placeholder, name) =>
          Object.hasOwn(values, name) ? String(values[name]) : placeholder,
        )
      : template;
  };
}

export function translate(language: Language) {
  return translations[language];
}

/** Format a measurement without adding grouping or changing its precision. */
export function fixed(value: number, digits: number, language: Language) {
  const text = value.toFixed(digits);
  return language === "nb" ? text.replace(".", ",") : text;
}
