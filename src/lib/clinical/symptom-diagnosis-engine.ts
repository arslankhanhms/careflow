import { DIAGNOSES, type DiagnosisEntry, findDiagnosis } from "./diagnoses";

/** Rank diagnoses by overlap with the doctor-entered symptoms. */
export function suggestDiagnosesFromSymptoms(
  symptoms: string[],
  limit = 5,
): Array<{ diagnosis: DiagnosisEntry; score: number; matched: string[] }> {
  const normalized = symptoms.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) return [];
  const scored = DIAGNOSES.map((d) => {
    const matched = d.symptoms.filter((s) => normalized.includes(s));
    const score = matched.length / Math.max(1, d.symptoms.length) + matched.length * 0.05;
    return { diagnosis: d, score, matched };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}

/** When a diagnosis is chosen, suggest the typical symptoms (Title-cased for chips). */
export function suggestSymptomsForDiagnosis(diagnosisName: string): string[] {
  const d = findDiagnosis(diagnosisName);
  if (!d) return [];
  return d.symptoms.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
}
