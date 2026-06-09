export interface BmiResult {
  bmi: number;
  category: "Underweight" | "Normal" | "Overweight" | "Obese" | "Severely obese";
  /** Surface color for chips/badges. */
  tone: "blue" | "green" | "amber" | "orange" | "red";
}

/** weightKg / (heightCm/100)^2 — returns null if either input is invalid. */
export function computeBMI(weightKg?: number | string, heightCm?: number | string): BmiResult | null {
  const w = typeof weightKg === "string" ? parseFloat(weightKg) : weightKg;
  const h = typeof heightCm === "string" ? parseFloat(heightCm) : heightCm;
  if (!w || !h || w <= 0 || h <= 0) return null;
  const m = h / 100;
  const bmi = +(w / (m * m)).toFixed(1);
  if (bmi < 18.5) return { bmi, category: "Underweight", tone: "blue" };
  if (bmi < 25)   return { bmi, category: "Normal", tone: "green" };
  if (bmi < 30)   return { bmi, category: "Overweight", tone: "amber" };
  if (bmi < 35)   return { bmi, category: "Obese", tone: "orange" };
  return { bmi, category: "Severely obese", tone: "red" };
}

/** Extract a numeric value out of a vitals string like "72kg" or "175 cm". */
export function parseMeasurement(v?: string | number | null): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = v.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
