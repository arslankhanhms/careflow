import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";

function getModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI service not configured. Enable Lovable AI Gateway.");
  return createLovableAiGatewayProvider(key)("google/gemini-2.5-flash");
}

/** Recover a JSON object from the raw text the model returned, even when the
 *  AI SDK's structured-output parser failed. Returns the validated object or null. */
function recoverFromError<T extends z.ZodTypeAny>(err: unknown, schema: T): z.infer<T> | null {
  try {
    const e: any = err;
    const candidates: string[] = [];
    const push = (v: any) => { if (typeof v === "string" && v.trim()) candidates.push(v); };
    push(e?.text);
    push(e?.response?.text);
    push(e?.cause?.text);
    push(e?.cause?.response?.text);
    // Some SDK errors stash the raw model output under .output or .value
    push(e?.output);
    push(typeof e?.value === "string" ? e.value : undefined);
    push(typeof e?.message === "string" ? e.message : undefined);
    for (const text of candidates) {
      const cleaned = text.replace(/```(?:json)?/gi, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) continue;
      try {
        const parsed = JSON.parse(match[0]);
        return schema.parse(parsed);
      } catch { /* try next candidate */ }
    }
    return null;
  } catch {
    return null;
  }
}

/** Last-resort: call the model again with a plain text prompt asking for JSON only,
 *  then parse it. Used when structured-output generation throws. */
async function jsonFallback<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  prompt: string,
): Promise<z.infer<T> | null> {
  try {
    const { text } = await generateText({
      model: getModel(),
      system: system + "\n\nReturn ONLY a single valid minified JSON object — no markdown, no commentary.",
      prompt,
    });
    const cleaned = (text || "").replace(/```(?:json)?/gi, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return schema.parse(JSON.parse(match[0]));
  } catch {
    return null;
  }
}

/* ============= PRESCRIPTION HELPER ============= */
const prescriptionSchema = z.object({
  diagnosis: z.string().default(""),
  medications: z.array(
    z.object({
      name: z.string().default(""),
      dosage: z.string().default(""),
      frequency: z.string().default(""),
      duration: z.string().default(""),
      route: z.string().default(""),
      instructions: z.string().default(""),
    }),
  ).default([]),
  precautions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  interactionAlerts: z.array(z.string()).default([]),
  followUp: z.string().default(""),
  disclaimer: z.string().default("Physician must verify and sign."),
});

export const generatePrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      diagnosis: z.string().min(2).max(500),
      patientAge: z.number().int().min(0).max(120),
      patientSex: z.string().max(20).optional(),
      patientWeight: z.number().min(0).max(500).optional(),
      allergies: z.string().max(500).optional(),
      currentMeds: z.string().max(500).optional(),
      chronicConditions: z.string().max(500).optional(),
      pastPrescriptions: z.string().max(2000).optional(),
      notes: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const system =
      "You are a clinical prescription assistant for licensed physicians. Given the diagnosis and full patient context, suggest evidence-based medications with dose (e.g. 250mg/500mg/5ml), frequency using OD/BD/BDS/TDS/QID/HS/SOS/STAT, duration (e.g. 3/5/7/14 days), route, precautions (food/timing/lifestyle), warnings (pediatric/pregnancy/renal/hepatic cautions), interaction alerts, and a suggested follow-up window (e.g. 'After 7 Days'). Use pediatric mg/kg where appropriate. Always include a disclaimer that the physician must verify and sign.";
    const prompt = `Diagnosis: ${data.diagnosis}
Patient: age ${data.patientAge}${data.patientSex ? `, sex ${data.patientSex}` : ""}${data.patientWeight ? `, weight ${data.patientWeight}kg` : ""}
Allergies: ${data.allergies || "none reported"}
Chronic conditions: ${data.chronicConditions || "none"}
Current medications: ${data.currentMeds || "none"}
Past prescriptions: ${data.pastPrescriptions || "none"}
Clinical notes: ${data.notes || "n/a"}

Generate a complete prescription draft with precautions, warnings, interactions and a suggested follow-up.`;
    try {
      const { experimental_output } = await generateText({
        model: getModel(),
        experimental_output: Output.object({ schema: prescriptionSchema }),
        system,
        prompt,
      });
      return { ok: true as const, result: experimental_output };
    } catch (err) {
      const recovered = recoverFromError(err, prescriptionSchema);
      if (recovered) return { ok: true as const, result: recovered };
      const fb = await jsonFallback(prescriptionSchema, system, prompt);
      if (fb) return { ok: true as const, result: fb };
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });

/* ============= VOICE → SOAP NOTE ============= */
const soapSchema = z.object({
  subjective: z.string().default(""),
  objective: z.string().default(""),
  assessment: z.string().default(""),
  plan: z.string().default(""),
  icd10Suggestions: z.array(z.object({ code: z.string().default(""), description: z.string().default("") })).default([]),
  cptSuggestions: z.array(z.object({ code: z.string().default(""), description: z.string().default("") })).default([]),
});

export const generateSoap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      transcript: z.string().min(10).max(20000),
      patientContext: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { experimental_output } = await generateText({
        model: getModel(),
        experimental_output: Output.object({ schema: soapSchema }),
        system:
          "You are a medical scribe AI. Convert a doctor-patient consultation transcript into a structured SOAP note (Subjective, Objective, Assessment, Plan). Suggest ICD-10 and CPT codes where appropriate. Be concise and clinically accurate.",
        prompt: `Patient context: ${data.patientContext || "not provided"}

Consultation transcript:
"""
${data.transcript}
"""

Produce the SOAP note.`,
      });
      return { ok: true as const, result: experimental_output };
    } catch (err) {
      const recovered = recoverFromError(err, soapSchema);
      if (recovered) return { ok: true as const, result: recovered };
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });

/* ============= DISCHARGE SUMMARY ============= */
const dischargeSchema = z.object({
  admissionSummary: z.string().default(""),
  hospitalCourse: z.string().default(""),
  finalDiagnosis: z.array(z.string()).default([]),
  proceduresPerformed: z.array(z.string()).default([]),
  dischargeMedications: z.array(
    z.object({ name: z.string().default(""), dose: z.string().default(""), instructions: z.string().default("") }),
  ).default([]),
  followUpInstructions: z.string().default(""),
  warningSignsToReturn: z.array(z.string()).default([]),
  patientEducation: z.string().default(""),
});

export const generateDischarge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      patientName: z.string().min(1).max(120),
      admissionDate: z.string().max(40),
      dischargeDate: z.string().max(40),
      diagnosis: z.string().min(2).max(500),
      hospitalCourseNotes: z.string().min(5).max(5000),
      procedures: z.string().max(1000).optional(),
      medications: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { experimental_output } = await generateText({
        model: getModel(),
        experimental_output: Output.object({ schema: dischargeSchema }),
        system:
          "You are a clinical documentation AI generating a comprehensive, patient-friendly hospital discharge summary. Be thorough, clear, and actionable for the patient and primary care follow-up.",
        prompt: `Patient: ${data.patientName}
Admitted: ${data.admissionDate}  Discharged: ${data.dischargeDate}
Primary diagnosis: ${data.diagnosis}
Hospital course notes: ${data.hospitalCourseNotes}
Procedures: ${data.procedures || "none"}
Discharge medications: ${data.medications || "none specified"}

Generate the discharge summary.`,
      });
      return { ok: true as const, result: experimental_output };
    } catch (err) {
      const recovered = recoverFromError(err, dischargeSchema);
      if (recovered) return { ok: true as const, result: recovered };
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });

/* ============= LAB INTERPRETATION ============= */
const labInterpSchema = z.object({
  overallAssessment: z.string().default(""),
  abnormalFindings: z.array(
    z.object({
      test: z.string().default(""),
      value: z.string().default(""),
      flag: z.enum(["high", "low", "critical-high", "critical-low", "abnormal"]).default("abnormal"),
      interpretation: z.string().default(""),
    }),
  ).default([]),
  clinicalCorrelations: z.array(z.string()).default([]),
  recommendedFollowUp: z.array(z.string()).default([]),
  urgency: z.enum(["routine", "soon", "urgent", "critical"]).default("routine"),
  disclaimer: z.string().default("Physician must verify interpretation."),
});

export const interpretLabs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      patientAge: z.number().int().min(0).max(120),
      patientGender: z.enum(["M", "F", "Other"]),
      results: z.string().min(5).max(5000),
      clinicalContext: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { experimental_output } = await generateText({
        model: getModel(),
        experimental_output: Output.object({ schema: labInterpSchema }),
        system:
          "You are a clinical pathology AI that interprets lab results in context. Identify abnormal values, suggest clinical correlations and follow-up. Flag critical values clearly. Always include a disclaimer.",
        prompt: `Patient: ${data.patientAge}y ${data.patientGender}
Clinical context: ${data.clinicalContext || "routine screening"}

Lab results (raw):
${data.results}

Provide interpretation.`,
      });
      return { ok: true as const, result: experimental_output };
    } catch (err) {
      const recovered = recoverFromError(err, labInterpSchema);
      if (recovered) return { ok: true as const, result: recovered };
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });

/* ============= DOCTOR ASSISTANT (free-form Q&A) ============= */
export const askDoctorAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      question: z.string().min(2).max(2000),
      history: z.array(z.object({
        role: z.enum(["user","assistant"]),
        content: z.string().max(4000),
      })).max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const system = `You are MediFlow AI — a clinical reference assistant used by licensed doctors inside a hospital EMR.
Provide concise, evidence-informed answers about diseases, standard treatment protocols, drug doses, contraindications and interactions.
Rules: Be brief and structured. Always remind that "Final clinical judgment lies with the treating physician." Never fabricate dosages.`;
    const messages: any[] = [{ role: "system", content: system }];
    for (const m of data.history ?? []) messages.push({ role: m.role, content: m.content });
    messages.push({ role: "user", content: data.question });
    try {
      const { text } = await generateText({ model: getModel(), messages });
      return { ok: true as const, answer: text };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });

/* ============= MEDICAL IMAGE / REPORT ANALYSIS ============= */
export const analyzeMedicalImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      imageDataUrl: z.string().min(20).max(8_000_000), // data:<mime>;base64,...
      mimeType: z.string().min(3).max(80),
      question: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const system = `You are a clinical imaging and laboratory report assistant for licensed physicians.
When given an X-ray, scan, or lab report image:
- Describe what you observe (anatomy, regions, technique notes when relevant).
- List notable findings and possible interpretations with likelihood.
- Highlight red flags or critical findings clearly.
- Suggest follow-up tests or next steps.
- End with: "Final clinical judgment lies with the treating physician."
Never fabricate measurements. If image quality is too poor, say so.`;
    const userPrompt = data.question?.trim() || "Analyze this medical image/report and give a full clinical interpretation.";
    try {
      const base64 = data.imageDataUrl.includes(",") ? data.imageDataUrl.split(",")[1] : data.imageDataUrl;
      const { text } = await generateText({
        model: getModel(),
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image", image: base64, mediaType: data.mimeType },
            ] as any,
          },
        ],
      });
      return { ok: true as const, answer: text };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });

/* ============= AI DOSING ASSISTANT (prescription side-panel) ============= */
const doseSchema = z.object({
  recommendedDose: z.string().default(""),
  recommendedFrequency: z.string().default(""),
  recommendedDuration: z.string().default(""),
  warnings: z.array(z.string()).default([]),
  interactions: z.array(z.string()).default([]),
  ageSuitability: z.string().default(""),
  rationale: z.string().default(""),
});

export const suggestDose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      medicineName: z.string().min(1).max(200),
      medicineForm: z.string().max(50).optional(),
      patientAge: z.number().min(0).max(120).optional(),
      patientWeightKg: z.number().min(0).max(500).optional(),
      patientSex: z.string().max(20).optional(),
      diagnosis: z.string().max(500).optional(),
      allergies: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const system =
      "You are a clinical dosing assistant for licensed physicians. Given a medicine, patient demographics and diagnosis, return safe evidence-based dosing for that exact form (Tablet/Syrup/Drops/etc). Prefer pediatric mg/kg calculations for children. Flag contraindications, age suitability, allergy and interaction risks. Use short, clinical language. Always remind the doctor to verify.";
    const prompt = `Medicine: ${data.medicineName}${data.medicineForm ? ` (${data.medicineForm})` : ""}
Patient: age ${data.patientAge ?? "?"}, weight ${data.patientWeightKg ?? "?"}kg, sex ${data.patientSex ?? "?"}
Diagnosis: ${data.diagnosis ?? "n/a"}
Allergies: ${data.allergies ?? "none reported"}

Return: recommendedDose (e.g. "5ml" or "500mg"), recommendedFrequency (use OD/BD/BDS/TDS/QID/HS/SOS/STAT), recommendedDuration (e.g. "5 days"), warnings, interactions, ageSuitability, brief rationale.`;
    try {
      const { experimental_output } = await generateText({
        model: getModel(),
        experimental_output: Output.object({ schema: doseSchema }),
        system,
        prompt,
      });
      return { ok: true as const, result: experimental_output };
    } catch (err) {
      const recovered = recoverFromError(err, doseSchema);
      if (recovered) return { ok: true as const, result: recovered };
      const fb = await jsonFallback(doseSchema, system, prompt);
      if (fb) return { ok: true as const, result: fb };
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });

/* ============= DIAGNOSIS SUGGESTIONS (from symptoms) ============= */
const diagnosisSuggestionSchema = z.object({
  suggestions: z.array(z.object({
    diagnosis: z.string().default(""),
    likelihood: z.enum(["low", "moderate", "high"]).default("moderate"),
    rationale: z.string().default(""),
    references: z.array(z.string()).default([]),
  })).default([]),
});

export const suggestDiagnoses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symptoms: z.array(z.string().max(120)).min(1).max(30),
      patientAge: z.number().min(0).max(120).optional(),
      patientSex: z.string().max(20).optional(),
      chronicConditions: z.array(z.string().max(120)).max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const system =
      "You are a clinical decision-support assistant. Given presenting symptoms and patient demographics, rank the 4–6 most likely diagnoses with a brief evidence-based rationale and 1–2 guideline references (NICE, IDSA, WHO, AAN, ADA, GOLD, GINA, etc.). Final decision rests with the treating physician.";
    const prompt = `Symptoms: ${data.symptoms.join(", ")}
Patient: age ${data.patientAge ?? "?"}, sex ${data.patientSex ?? "?"}
Chronic conditions: ${(data.chronicConditions ?? []).join(", ") || "none"}

Return ranked diagnosis suggestions.`;
    try {
      const { experimental_output } = await generateText({
        model: getModel(),
        experimental_output: Output.object({ schema: diagnosisSuggestionSchema }),
        system, prompt,
      });
      return { ok: true as const, result: experimental_output };
    } catch (err) {
      const recovered = recoverFromError(err, diagnosisSuggestionSchema);
      if (recovered) return { ok: true as const, result: recovered };
      const fb = await jsonFallback(diagnosisSuggestionSchema, system, prompt);
      if (fb) return { ok: true as const, result: fb };
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });

/* ============= TREATMENT PLAN (from diagnosis) ============= */
const treatmentPlanSchema = z.object({
  medications: z.array(z.object({
    name: z.string().default(""),
    dose: z.string().default(""),
    frequency: z.string().default(""),
    duration: z.string().default(""),
    instructions: z.string().default(""),
  })).default([]),
  nonPharmacological: z.array(z.string()).default([]),
  followUpDays: z.number().int().min(0).max(365).default(7),
  redFlags: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
});

export const suggestTreatmentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      diagnosis: z.string().min(2).max(300),
      patientAge: z.number().min(0).max(120).optional(),
      patientWeightKg: z.number().min(0).max(500).optional(),
      bmi: z.number().min(0).max(80).optional(),
      allergies: z.array(z.string().max(120)).max(20).optional(),
      chronicConditions: z.array(z.string().max(120)).max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const system =
      "You are a clinical treatment-planning assistant. Generate an evidence-based first-line plan for the diagnosis with medications (use OD/BD/BDS/TDS/QID/HS/SOS frequency codes), non-pharmacological advice, follow-up window in days, red-flag return criteria, and 1–3 guideline references. Honor allergies and adjust for age/weight/BMI. Physician must verify.";
    const prompt = `Diagnosis: ${data.diagnosis}
Patient: age ${data.patientAge ?? "?"}, weight ${data.patientWeightKg ?? "?"}kg, BMI ${data.bmi ?? "?"}
Allergies: ${(data.allergies ?? []).join(", ") || "none reported"}
Chronic conditions: ${(data.chronicConditions ?? []).join(", ") || "none"}

Return treatment plan.`;
    try {
      const { experimental_output } = await generateText({
        model: getModel(),
        experimental_output: Output.object({ schema: treatmentPlanSchema }),
        system, prompt,
      });
      return { ok: true as const, result: experimental_output };
    } catch (err) {
      const recovered = recoverFromError(err, treatmentPlanSchema);
      if (recovered) return { ok: true as const, result: recovered };
      const fb = await jsonFallback(treatmentPlanSchema, system, prompt);
      if (fb) return { ok: true as const, result: fb };
      return { ok: false as const, error: err instanceof Error ? err.message : "AI request failed" };
    }
  });


