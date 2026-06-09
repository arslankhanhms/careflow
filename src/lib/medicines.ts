/** Seed medicine catalog used for the prescription autocomplete. */
export type MedicineForm = "Tablet" | "Capsule" | "Syrup" | "Suspension" | "Drops" | "Injection" | "Cream" | "Inhaler";

export interface MedicineEntry {
  /** Brand or generic display name (e.g. "Panadol Tablet"). */
  name: string;
  /** Base brand or molecule key — used for grouping (e.g. "Panadol"). */
  brand: string;
  /** Generic / formula name (active molecule), e.g. "Paracetamol". */
  generic: string;
  /** Manufacturer / company, e.g. "GSK". */
  company: string;
  form: MedicineForm;
  /** Strength options for this form. */
  strengths: string[];
}

interface BrandDef {
  brand: string;
  generic: string;
  company: string;
  forms: { form: MedicineForm; strengths: string[]; suffix?: string }[];
}

function expand(defs: BrandDef[]): MedicineEntry[] {
  const out: MedicineEntry[] = [];
  for (const d of defs) {
    for (const f of d.forms) {
      out.push({
        name: `${d.brand}${f.suffix ?? ""} ${f.form}`,
        brand: d.brand, generic: d.generic, company: d.company,
        form: f.form, strengths: f.strengths,
      });
    }
  }
  return out;
}

export const MEDICINE_CATALOG: MedicineEntry[] = expand([
  { brand: "Panadol", generic: "Paracetamol", company: "GSK", forms: [
    { form: "Tablet",     strengths: ["500mg", "1000mg"] },
    { form: "Syrup",      strengths: ["120mg/5ml", "250mg/5ml"] },
    { form: "Drops",      strengths: ["100mg/ml"] },
    { form: "Tablet",     strengths: ["500mg"], suffix: " Extra" },
  ]},
  { brand: "Calpol", generic: "Paracetamol", company: "GSK", forms: [
    { form: "Syrup",      strengths: ["120mg/5ml"] },
    { form: "Drops",      strengths: ["100mg/ml"] },
  ]},
  { brand: "Brufen", generic: "Ibuprofen", company: "Abbott", forms: [
    { form: "Tablet",     strengths: ["200mg", "400mg", "600mg"] },
    { form: "Syrup",      strengths: ["100mg/5ml"] },
  ]},
  { brand: "Augmentin", generic: "Amoxicillin + Clavulanate", company: "GSK", forms: [
    { form: "Tablet",     strengths: ["375mg", "625mg", "1g"] },
    { form: "Suspension", strengths: ["156mg/5ml", "312mg/5ml", "457mg/5ml"] },
  ]},
  { brand: "Amoxil", generic: "Amoxicillin", company: "GSK", forms: [
    { form: "Capsule",    strengths: ["250mg", "500mg"] },
    { form: "Syrup",      strengths: ["125mg/5ml", "250mg/5ml"] },
  ]},
  { brand: "Ciproxin", generic: "Ciprofloxacin", company: "Bayer", forms: [
    { form: "Tablet",     strengths: ["250mg", "500mg", "750mg"] },
  ]},
  { brand: "Flagyl", generic: "Metronidazole", company: "Sanofi", forms: [
    { form: "Tablet",     strengths: ["200mg", "400mg"] },
    { form: "Suspension", strengths: ["200mg/5ml"] },
  ]},
  { brand: "Risek", generic: "Omeprazole", company: "Getz Pharma", forms: [
    { form: "Capsule",    strengths: ["20mg", "40mg"] },
  ]},
  { brand: "Nexum", generic: "Esomeprazole", company: "Getz Pharma", forms: [
    { form: "Tablet",     strengths: ["20mg", "40mg"] },
  ]},
  { brand: "Loprin", generic: "Aspirin", company: "Highnoon", forms: [
    { form: "Tablet",     strengths: ["75mg", "150mg"] },
  ]},
  { brand: "Glucophage", generic: "Metformin", company: "Merck", forms: [
    { form: "Tablet",     strengths: ["500mg", "850mg", "1000mg"] },
  ]},
  { brand: "Tenoric", generic: "Atenolol + Chlorthalidone", company: "ICI", forms: [
    { form: "Tablet",     strengths: ["25mg", "50mg", "100mg"] },
  ]},
  { brand: "Norvasc", generic: "Amlodipine", company: "Pfizer", forms: [
    { form: "Tablet",     strengths: ["5mg", "10mg"] },
  ]},
  { brand: "Concor", generic: "Bisoprolol", company: "Merck", forms: [
    { form: "Tablet",     strengths: ["2.5mg", "5mg", "10mg"] },
  ]},
  { brand: "Lipiget", generic: "Atorvastatin", company: "Getz Pharma", forms: [
    { form: "Tablet",     strengths: ["10mg", "20mg", "40mg"] },
  ]},
  { brand: "Ventolin", generic: "Salbutamol", company: "GSK", forms: [
    { form: "Inhaler",    strengths: ["100mcg"] },
    { form: "Syrup",      strengths: ["2mg/5ml"] },
  ]},
  { brand: "Avil", generic: "Pheniramine", company: "Sanofi", forms: [
    { form: "Tablet",     strengths: ["25mg"] },
    { form: "Injection",  strengths: ["45.5mg/2ml"] },
  ]},
  { brand: "Zyrtec", generic: "Cetirizine", company: "UCB", forms: [
    { form: "Tablet",     strengths: ["10mg"] },
    { form: "Syrup",      strengths: ["5mg/5ml"] },
  ]},
  { brand: "Motilium", generic: "Domperidone", company: "Janssen", forms: [
    { form: "Tablet",     strengths: ["10mg"] },
    { form: "Suspension", strengths: ["1mg/ml"] },
  ]},
  { brand: "Dispirin", generic: "Aspirin", company: "Reckitt", forms: [
    { form: "Tablet",     strengths: ["75mg", "300mg"] },
  ]},
]);

/** Search by brand, generic (formula) or company. */
export function searchMedicines(query: string, limit = 10): MedicineEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return MEDICINE_CATALOG.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.brand.toLowerCase().includes(q) ||
      m.generic.toLowerCase().includes(q) ||
      m.company.toLowerCase().includes(q),
  ).slice(0, limit);
}
