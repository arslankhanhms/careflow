/** Backwards-compat shim — the canonical frequency catalog now lives in
 *  src/lib/clinical/frequencies.ts (extended with Urdu patterns + Weekly/Fortnightly).
 *  Existing imports continue to work via this re-export. */
export { FREQUENCY_OPTIONS, getFrequency, formatFrequency } from "./clinical/frequencies";
export type { FrequencyCode, FrequencyOption } from "./clinical/frequencies";

/** Strip the legacy MRN prefix and show just the numeric tail (e.g. MRN-2026-000093 → "MRN: 93"). */
export function formatMRN(mrn?: string | null): string {
  if (!mrn) return "";
  const tail = mrn.replace(/^MRN[-_]?\d{0,4}[-_]?/i, "").replace(/^0+/, "");
  return tail ? `MRN: ${tail}` : `MRN: ${mrn}`;
}
