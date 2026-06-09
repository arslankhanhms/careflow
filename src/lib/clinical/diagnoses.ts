/** Curated diagnosis catalog with symptom links, suggested first-line meds, and follow-up windows. */
export interface DiagnosisEntry {
  name: string;
  /** Lowercased symptoms that commonly point to this diagnosis. */
  symptoms: string[];
  /** Severity drives default follow-up gap. */
  severity: "low" | "moderate" | "high";
  followUpDays: number;
  /** Suggested first-line medication names (brand or generic). */
  suggestedMeds?: { name: string; dose?: string; frequency?: string; duration?: string }[];
  /** Brief guideline reference text. */
  references?: string[];
}

export const DIAGNOSES: DiagnosisEntry[] = [
  {
    name: "Upper Respiratory Tract Infection (URTI)",
    symptoms: ["fever", "cough", "sore throat", "runny nose", "nasal congestion", "sneezing", "headache"],
    severity: "low", followUpDays: 5,
    suggestedMeds: [
      { name: "Panadol Tablet", dose: "500mg", frequency: "TDS", duration: "5 days" },
      { name: "Zyrtec Tablet", dose: "10mg", frequency: "HS", duration: "5 days" },
    ],
    references: ["NICE CG69 – Respiratory tract infections", "WHO IMCI 2023"],
  },
  {
    name: "Viral Pharyngitis / Tonsillitis",
    symptoms: ["sore throat", "fever", "hoarseness", "cough"],
    severity: "low", followUpDays: 5,
    suggestedMeds: [
      { name: "Brufen Tablet", dose: "400mg", frequency: "TDS", duration: "3 days" },
      { name: "Panadol Tablet", dose: "500mg", frequency: "QID", duration: "3 days" },
    ],
    references: ["IDSA Pharyngitis Guideline 2012"],
  },
  {
    name: "Bacterial Tonsillitis",
    symptoms: ["sore throat", "high-grade fever", "fever"],
    severity: "moderate", followUpDays: 7,
    suggestedMeds: [
      { name: "Augmentin Tablet", dose: "625mg", frequency: "BD", duration: "7 days" },
      { name: "Panadol Tablet", dose: "500mg", frequency: "QID", duration: "5 days" },
    ],
    references: ["IDSA GAS Pharyngitis 2012"],
  },
  {
    name: "Acute Bronchitis",
    symptoms: ["productive cough", "cough", "chest tightness", "fever", "shortness of breath"],
    severity: "moderate", followUpDays: 7,
    suggestedMeds: [
      { name: "Augmentin Tablet", dose: "625mg", frequency: "BD", duration: "7 days" },
      { name: "Ventolin Inhaler", dose: "2 puffs", frequency: "QID", duration: "7 days" },
    ],
    references: ["GOLD 2023"],
  },
  {
    name: "Community-Acquired Pneumonia",
    symptoms: ["productive cough", "high-grade fever", "shortness of breath", "chest pain", "fatigue"],
    severity: "high", followUpDays: 3,
    suggestedMeds: [
      { name: "Augmentin Tablet", dose: "1g", frequency: "BD", duration: "7 days" },
    ],
    references: ["IDSA/ATS CAP 2019"],
  },
  {
    name: "Acute Gastroenteritis",
    symptoms: ["diarrhea", "vomiting", "abdominal pain", "nausea", "fever"],
    severity: "moderate", followUpDays: 3,
    suggestedMeds: [
      { name: "Flagyl Tablet", dose: "400mg", frequency: "TDS", duration: "5 days" },
      { name: "Motilium Tablet", dose: "10mg", frequency: "TDS", duration: "3 days" },
    ],
    references: ["WHO Diarrhoea Mgmt 2017"],
  },
  {
    name: "Gastritis / Dyspepsia",
    symptoms: ["epigastric pain", "nausea", "loss of appetite", "abdominal pain"],
    severity: "low", followUpDays: 14,
    suggestedMeds: [
      { name: "Risek Capsule", dose: "20mg", frequency: "OD", duration: "14 days" },
    ],
    references: ["Maastricht VI Consensus"],
  },
  {
    name: "GERD",
    symptoms: ["epigastric pain", "chest pain", "nausea", "cough"],
    severity: "low", followUpDays: 14,
    suggestedMeds: [
      { name: "Nexum Tablet", dose: "40mg", frequency: "OD", duration: "14 days" },
    ],
    references: ["ACG GERD 2022"],
  },
  {
    name: "Urinary Tract Infection",
    symptoms: ["dysuria", "frequency", "urgency", "hematuria", "flank pain", "fever"],
    severity: "moderate", followUpDays: 5,
    suggestedMeds: [
      { name: "Ciproxin Tablet", dose: "500mg", frequency: "BD", duration: "5 days" },
    ],
    references: ["IDSA Uncomplicated UTI 2010"],
  },
  {
    name: "Migraine",
    symptoms: ["headache", "nausea", "photophobia", "vomiting"],
    severity: "low", followUpDays: 14,
    suggestedMeds: [
      { name: "Brufen Tablet", dose: "400mg", frequency: "SOS", duration: "PRN" },
    ],
    references: ["AAN Migraine Guideline 2021"],
  },
  {
    name: "Tension Headache",
    symptoms: ["headache", "neck pain", "stress"],
    severity: "low", followUpDays: 14,
    suggestedMeds: [
      { name: "Panadol Tablet", dose: "500mg", frequency: "TDS", duration: "3 days" },
    ],
  },
  {
    name: "Hypertension (newly diagnosed)",
    symptoms: ["headache", "dizziness", "palpitations"],
    severity: "moderate", followUpDays: 14,
    suggestedMeds: [
      { name: "Norvasc Tablet", dose: "5mg", frequency: "OD", duration: "30 days" },
    ],
    references: ["ACC/AHA HTN 2017"],
  },
  {
    name: "Type 2 Diabetes (newly diagnosed)",
    symptoms: ["polydipsia", "polyuria", "polyphagia", "weight loss", "fatigue"],
    severity: "moderate", followUpDays: 14,
    suggestedMeds: [
      { name: "Glucophage Tablet", dose: "500mg", frequency: "BD", duration: "30 days" },
    ],
    references: ["ADA Standards of Care 2024"],
  },
  {
    name: "Allergic Rhinitis",
    symptoms: ["sneezing", "nasal congestion", "runny nose", "itching"],
    severity: "low", followUpDays: 14,
    suggestedMeds: [
      { name: "Zyrtec Tablet", dose: "10mg", frequency: "OD", duration: "14 days" },
    ],
  },
  {
    name: "Bronchial Asthma (exacerbation)",
    symptoms: ["wheezing", "shortness of breath", "cough", "chest tightness"],
    severity: "high", followUpDays: 3,
    suggestedMeds: [
      { name: "Ventolin Inhaler", dose: "2 puffs", frequency: "QID", duration: "5 days" },
    ],
    references: ["GINA 2024"],
  },
  {
    name: "Anxiety Disorder",
    symptoms: ["anxiety", "palpitations", "insomnia", "irritability"],
    severity: "low", followUpDays: 14,
  },
  {
    name: "Acute Lumbar Sprain",
    symptoms: ["back pain", "stiffness", "muscle pain"],
    severity: "low", followUpDays: 7,
    suggestedMeds: [
      { name: "Brufen Tablet", dose: "400mg", frequency: "TDS", duration: "5 days" },
    ],
  },
  {
    name: "Conjunctivitis",
    symptoms: ["red eye", "itching", "watery eye", "eye pain"],
    severity: "low", followUpDays: 5,
  },
  {
    name: "Otitis Media",
    symptoms: ["ear pain", "fever", "hearing loss", "ear discharge"],
    severity: "moderate", followUpDays: 7,
    suggestedMeds: [
      { name: "Amoxil Capsule", dose: "500mg", frequency: "TDS", duration: "7 days" },
    ],
  },
  {
    name: "Skin Allergy / Urticaria",
    symptoms: ["rash", "itching", "hives"],
    severity: "low", followUpDays: 7,
    suggestedMeds: [
      { name: "Avil Tablet", dose: "25mg", frequency: "BD", duration: "5 days" },
    ],
  },
];

export function searchDiagnoses(q: string, limit = 10): DiagnosisEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return DIAGNOSES.slice(0, limit);
  return DIAGNOSES.filter((d) => d.name.toLowerCase().includes(s)).slice(0, limit);
}

export function findDiagnosis(name: string): DiagnosisEntry | undefined {
  const s = name.trim().toLowerCase();
  return DIAGNOSES.find((d) => d.name.toLowerCase() === s);
}
