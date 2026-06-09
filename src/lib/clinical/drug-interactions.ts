/** Curated dangerous drug interaction rules. Matches by case-insensitive substring on medicine name. */
export interface InteractionRule {
  a: string[]; // any of these
  b: string[]; // any of these
  severity: "high" | "moderate";
  message: string;
}

export const INTERACTION_RULES: InteractionRule[] = [
  {
    a: ["maoi", "selegiline", "phenelzine", "tranylcypromine", "isocarboxazid"],
    b: ["ssri", "fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram"],
    severity: "high",
    message: "MAOI + SSRI: risk of serotonin syndrome. Avoid combination.",
  },
  {
    a: ["maoi", "selegiline", "phenelzine"],
    b: ["benzodiazepine", "diazepam", "alprazolam", "lorazepam", "valium", "xanax", "ativan"],
    severity: "high",
    message: "MAOI + Benzodiazepine: severe CNS depression and hypotension risk.",
  },
  {
    a: ["warfarin", "coumadin", "loprin", "aspirin"],
    b: ["brufen", "ibuprofen", "naproxen", "diclofenac", "nsaid"],
    severity: "high",
    message: "NSAID + anticoagulant/antiplatelet: major GI bleeding risk.",
  },
  {
    a: ["ciproxin", "ciprofloxacin", "levofloxacin"],
    b: ["tizanidine"],
    severity: "high",
    message: "Fluoroquinolone + Tizanidine: severe hypotension and sedation.",
  },
  {
    a: ["clarithromycin", "erythromycin"],
    b: ["simvastatin", "atorvastatin", "lipiget"],
    severity: "high",
    message: "Macrolide + Statin: risk of rhabdomyolysis.",
  },
  {
    a: ["nitrate", "nitroglycerin", "isosorbide"],
    b: ["sildenafil", "tadalafil", "vardenafil"],
    severity: "high",
    message: "Nitrate + PDE5 inhibitor: life-threatening hypotension.",
  },
  {
    a: ["ace inhibitor", "lisinopril", "enalapril", "ramipril"],
    b: ["spironolactone", "potassium"],
    severity: "moderate",
    message: "ACE-I + K-sparing diuretic: hyperkalemia risk.",
  },
  {
    a: ["metformin", "glucophage"],
    b: ["iodine contrast", "contrast media"],
    severity: "moderate",
    message: "Hold metformin around iodinated contrast (lactic acidosis risk).",
  },
  {
    a: ["tramadol"],
    b: ["ssri", "fluoxetine", "sertraline", "paroxetine"],
    severity: "high",
    message: "Tramadol + SSRI: serotonin syndrome and seizure risk.",
  },
];

function matchesAny(name: string, list: string[]): boolean {
  const n = name.toLowerCase();
  return list.some((k) => n.includes(k.toLowerCase()));
}

export interface DetectedInteraction {
  drugA: string;
  drugB: string;
  severity: "high" | "moderate";
  message: string;
}

export function detectInteractions(medicineNames: string[]): DetectedInteraction[] {
  const found: DetectedInteraction[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < medicineNames.length; i++) {
    for (let j = i + 1; j < medicineNames.length; j++) {
      const x = medicineNames[i]; const y = medicineNames[j];
      if (!x || !y) continue;
      for (const r of INTERACTION_RULES) {
        const hit =
          (matchesAny(x, r.a) && matchesAny(y, r.b)) ||
          (matchesAny(y, r.a) && matchesAny(x, r.b));
        if (hit) {
          const key = `${x}::${y}::${r.message}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ drugA: x, drugB: y, severity: r.severity, message: r.message });
        }
      }
    }
  }
  return found;
}
