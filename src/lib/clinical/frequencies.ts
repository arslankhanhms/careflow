/** Extended medical frequency catalog with English + Urdu patterns. */
export type FrequencyCode =
  | "OD" | "BD" | "BDS" | "TDS" | "QID" | "HS" | "SOS" | "STAT" | "WEEKLY" | "FORTNIGHTLY";

export interface FrequencyOption {
  code: FrequencyCode;
  label: string;
  /** Morning-noon-night dose pattern, e.g. "1-0-1". */
  pattern: string;
  /** Urdu human description (Roman script). */
  urdu: string;
}

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { code: "OD",          label: "Once Daily",        pattern: "1-0-0",    urdu: "Subha" },
  { code: "BD",          label: "Twice Daily",       pattern: "1-0-1",    urdu: "Subha Shaam" },
  { code: "BDS",         label: "Twice Daily",       pattern: "1-0-1",    urdu: "Subha Shaam" },
  { code: "TDS",         label: "Three Times Daily", pattern: "1-1-1",    urdu: "Subha Dopahar Shaam" },
  { code: "QID",         label: "Four Times Daily",  pattern: "1-1-1-1",  urdu: "Har 6 ghantay baad" },
  { code: "HS",          label: "At Bedtime",        pattern: "0-0-1",    urdu: "Raat ko sonay se pehle" },
  { code: "SOS",         label: "As Needed",         pattern: "",         urdu: "Zaroorat parnay par" },
  { code: "STAT",        label: "Immediately",       pattern: "",         urdu: "Foran" },
  { code: "WEEKLY",      label: "Once a Week",       pattern: "1×/wk",    urdu: "Haftay mein aik baar" },
  { code: "FORTNIGHTLY", label: "Every Two Weeks",   pattern: "1×/2wk",   urdu: "Do haftay baad" },
];

export function getFrequency(code?: string): FrequencyOption | null {
  if (!code) return null;
  return FREQUENCY_OPTIONS.find((f) => f.code === code.toUpperCase()) ?? null;
}

/** Render frequency string: "BDS (1-0-1) — Subha Shaam". */
export function formatFrequency(code?: string): string {
  const f = getFrequency(code);
  if (!f) return code ?? "";
  const en = f.pattern ? `${f.code} (${f.pattern})` : f.code;
  return f.urdu ? `${en} — ${f.urdu}` : en;
}
