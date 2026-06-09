import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ur";

const STRINGS = {
  en: {
    "nav.features": "Features",
    "nav.modules": "Modules",
    "nav.ai": "AI",
    "nav.pricing": "Pricing",
    "nav.findDoctor": "Find a doctor",
    "nav.signIn": "Sign in",
    "hero.badge": "New — AI Symptom Triage with Gemini 3",
    "hero.title1": "The",
    "hero.title2": "AI hospital OS",
    "hero.title3": "for modern healthcare teams",
    "hero.subtitle":
      "MediFlow AI is a multi-tenant SaaS platform for hospitals, clinics and polyclinics. One system for OPD, IPD, lab, pharmacy, billing — supercharged by AI assistants for triage, prescriptions and discharge summaries.",
    "hero.cta": "Sign in to your hospital",
    "hero.explore": "Explore features",
    "hero.compliance": "HIPAA-aware · Multi-tenant isolation · 2FA · Audit logs",
    "lang.toggle": "اردو",
  },
  ur: {
    "nav.features": "خصوصیات",
    "nav.modules": "ماڈیولز",
    "nav.ai": "اے آئی",
    "nav.pricing": "قیمتیں",
    "nav.findDoctor": "ڈاکٹر تلاش کریں",
    "nav.signIn": "سائن ان",
    "hero.badge": "نیا — Gemini 3 کے ساتھ اے آئی علامات کی جانچ",
    "hero.title1": "",
    "hero.title2": "اے آئی ہسپتال OS",
    "hero.title3": "جدید صحت ٹیموں کے لیے",
    "hero.subtitle":
      "میڈی فلو اے آئی ہسپتالوں، کلینکس اور پولی کلینکس کے لیے ایک ملٹی ٹیننٹ SaaS پلیٹ فارم ہے۔ OPD، IPD، لیب، فارمیسی اور بلنگ — ایک ہی نظام میں، اے آئی اسسٹنٹس کے ساتھ۔",
    "hero.cta": "اپنے ہسپتال میں سائن ان کریں",
    "hero.explore": "خصوصیات دیکھیں",
    "hero.compliance": "HIPAA کے مطابق · ملٹی ٹیننٹ تنہائی · 2FA · آڈٹ لاگز",
    "lang.toggle": "English",
  },
} as const;

type Key = keyof typeof STRINGS["en"];

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; toggle: () => void };
const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const v = localStorage.getItem("mf_lang");
      if (v === "ur" || v === "en") setLangState(v);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("mf_lang", l); } catch {}
  };
  const toggle = () => setLang(lang === "en" ? "ur" : "en");
  const t = (k: Key) => STRINGS[lang][k] ?? STRINGS.en[k];

  return <LangContext.Provider value={{ lang, setLang, t, toggle }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) return { lang: "en" as Lang, setLang: () => {}, t: (k: Key) => STRINGS.en[k], toggle: () => {} };
  return ctx;
}
