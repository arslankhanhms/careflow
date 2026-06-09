/** Common symptoms catalog used by the prescription editor multi-select. */
export const SYMPTOMS: string[] = [
  "Fever", "High-grade fever", "Low-grade fever", "Chills", "Rigors", "Sweating", "Night sweats",
  "Cough", "Dry cough", "Productive cough", "Hemoptysis", "Sore throat", "Hoarseness", "Runny nose", "Nasal congestion", "Sneezing",
  "Shortness of breath", "Wheezing", "Chest pain", "Chest tightness", "Palpitations",
  "Headache", "Migraine", "Dizziness", "Vertigo", "Fainting", "Seizures", "Confusion", "Memory loss",
  "Abdominal pain", "Epigastric pain", "Right upper quadrant pain", "Left lower quadrant pain", "Pelvic pain",
  "Nausea", "Vomiting", "Hematemesis", "Diarrhea", "Constipation", "Bloody stool", "Melena", "Loss of appetite", "Weight loss", "Weight gain",
  "Dysuria", "Frequency", "Urgency", "Hematuria", "Flank pain", "Polyuria",
  "Joint pain", "Joint swelling", "Back pain", "Neck pain", "Muscle pain", "Muscle weakness", "Stiffness",
  "Rash", "Itching", "Skin lesion", "Hives", "Dry skin", "Hair loss",
  "Fatigue", "Generalized weakness", "Body aches", "Insomnia", "Excessive sleep",
  "Blurred vision", "Eye pain", "Red eye", "Watery eye", "Photophobia",
  "Ear pain", "Hearing loss", "Tinnitus", "Ear discharge",
  "Anxiety", "Depression", "Mood swings", "Irritability",
  "Polydipsia", "Polyphagia", "Cold intolerance", "Heat intolerance",
  "Bleeding gums", "Easy bruising",
  "Menstrual irregularity", "Heavy menstruation", "Vaginal discharge",
];

export function searchSymptoms(q: string, limit = 12): string[] {
  const s = q.trim().toLowerCase();
  if (!s) return SYMPTOMS.slice(0, limit);
  return SYMPTOMS.filter((x) => x.toLowerCase().includes(s)).slice(0, limit);
}
