import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const BUCKET = "patient-reports";

function aiModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI is not configured (missing LOVABLE_API_KEY)");
  return createLovableAiGatewayProvider(key)("google/gemini-2.5-flash");
}

/** Patient: register a report row after they uploaded the file from the browser
 * directly to Supabase Storage. We re-validate ownership server-side. */
export const registerPatientReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      storage_path: z.string().min(3).max(500),
      original_name: z.string().min(1).max(255),
      mime_type: z.string().max(120).optional(),
      size_bytes: z.number().int().min(0).max(50_000_000).optional(),
      title: z.string().max(200).optional(),
      notes: z.string().max(1000).optional(),
      doctor_id: z.string().uuid().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: pat, error: pErr } = await supabaseAdmin
      .from("patients").select("id, hospital_id, assigned_doctor_id")
      .eq("user_id", userId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pat) throw new Error("Patient profile not found");

    // Ensure the storage path is inside the patient's own folder (uid/...).
    if (!data.storage_path.startsWith(`${userId}/`)) {
      throw new Error("Invalid upload path");
    }

    // Fallback chain for doctor: explicit -> assigned -> most recent appointment doctor
    let doctorId: string | null = data.doctor_id ?? pat.assigned_doctor_id ?? null;
    if (!doctorId) {
      const { data: recentAppt } = await supabaseAdmin
        .from("appointments")
        .select("doctor_id, created_at")
        .eq("patient_id", pat.id)
        .not("doctor_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      doctorId = (recentAppt as any)?.doctor_id ?? null;
    }

    const { data: row, error } = await supabaseAdmin.from("patient_reports").insert({
      hospital_id: pat.hospital_id,
      patient_id: pat.id,
      uploaded_by: userId,
      doctor_id: doctorId,
      storage_path: data.storage_path,
      original_name: data.original_name,
      mime_type: data.mime_type ?? null,
      size_bytes: data.size_bytes ?? null,
      title: data.title ?? null,
      notes: data.notes ?? null,
    }).select().single();
    if (error) throw new Error(error.message);

    // Notify the routed doctor; otherwise notify every doctor at the hospital
    const recipients = new Set<string>();
    if (doctorId) recipients.add(doctorId);
    if (recipients.size === 0 && pat.hospital_id) {
      const { data: docs } = await supabaseAdmin
        .from("user_roles").select("user_id")
        .eq("hospital_id", pat.hospital_id).eq("role", "doctor");
      for (const d of docs ?? []) recipients.add((d as any).user_id);
    }
    if (recipients.size > 0) {
      await supabaseAdmin.from("notifications").insert(
        Array.from(recipients).map((uid) => ({
          user_id: uid,
          hospital_id: pat.hospital_id,
          type: "patient.report_uploaded",
          title: "New patient report uploaded",
          body: `${data.title || data.original_name}`,
          data: { report_id: row.id, patient_id: pat.id },
        })),
      );
    }

    return { report: row };
  });

/** Patient: list my own uploaded reports (with signed URLs). */
export const listMyPatientReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: pat } = await supabaseAdmin
      .from("patients").select("id").eq("user_id", userId).maybeSingle();
    if (!pat) return [] as any[];

    const { data: rows, error } = await supabaseAdmin
      .from("patient_reports")
      .select("*")
      .eq("patient_id", pat.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const withUrls = await Promise.all((rows ?? []).map(async (r: any) => {
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET).createSignedUrl(r.storage_path, 3600);
      return { ...r, signed_url: signed?.signedUrl ?? null };
    }));
    return withUrls;
  });

/** Doctor: list reports uploaded to me (or to my hospital patients).
 *  filter=mine -> only my doctor_id; filter=all -> all hospital reports. */
export const listDoctorReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      filter: z.enum(["mine", "all"]).default("mine"),
      patient_id: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("hospital_id").eq("user_id", userId).maybeSingle();
    if (!prof?.hospital_id) return [] as any[];

    const { data: myAppts } = await supabaseAdmin
      .from("appointments").select("patient_id")
      .eq("doctor_id", userId).eq("hospital_id", prof.hospital_id);
    const myPatientIds = Array.from(
      new Set((myAppts ?? []).map((a: any) => a.patient_id).filter(Boolean)),
    );

    let q = supabaseAdmin
      .from("patient_reports")
      .select("*")
      .eq("hospital_id", prof.hospital_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.filter === "mine") {
      // Include reports explicitly routed to me OR for any patient I've ever seen
      if (myPatientIds.length > 0) {
        const csv = myPatientIds.join(",");
        q = q.or(`doctor_id.eq.${userId},patient_id.in.(${csv})`);
      } else {
        q = q.eq("doctor_id", userId);
      }
    }
    if (data.patient_id) q = q.eq("patient_id", data.patient_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const reportPatientIds = (rows ?? []).map((r: any) => r.patient_id).filter(Boolean);
    let labRows: any[] = [];
    let labResults: Record<string, any[]> = {};
    if (!data.patient_id) {
      let labQ = supabaseAdmin
        .from("lab_orders")
        .select("id, hospital_id, patient_id, ordered_by, referring_doctor_id, tests, status, notes, created_at, completed_at")
        .eq("hospital_id", prof.hospital_id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(100);
      if (data.filter === "mine") {
        if (myPatientIds.length > 0) {
          labQ = labQ.or(`ordered_by.eq.${userId},referring_doctor_id.eq.${userId},patient_id.in.(${myPatientIds.join(",")})`);
        } else {
          labQ = labQ.or(`ordered_by.eq.${userId},referring_doctor_id.eq.${userId}`);
        }
      }
      const { data: labs, error: labErr } = await labQ;
      if (labErr) throw new Error(labErr.message);
      labRows = labs ?? [];
      const labIds = labRows.map((l: any) => l.id);
      if (labIds.length) {
        const { data: results } = await supabaseAdmin
          .from("lab_results")
          .select("lab_order_id, test_name, value, unit, reference_range, flag, ai_interpretation, created_at")
          .in("lab_order_id", labIds);
        for (const r of results ?? []) {
          labResults[r.lab_order_id] = labResults[r.lab_order_id] || [];
          labResults[r.lab_order_id].push(r);
        }
      }
    }

    const patientIds = Array.from(new Set([
      ...reportPatientIds,
      ...labRows.map((r: any) => r.patient_id).filter(Boolean),
    ]));
    let patientMap: Record<string, any> = {};
    if (patientIds.length) {
      const { data: pts } = await supabaseAdmin
        .from("patients")
        .select("id, first_name, last_name, father_name, mrn, pmr_no, cnic, phone, gender, sex, dob, blood_group, address")
        .in("id", patientIds);
      patientMap = Object.fromEntries((pts ?? []).map((p: any) => [p.id, p]));
    }

    const withUrls = await Promise.all((rows ?? []).map(async (r: any) => {
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET).createSignedUrl(r.storage_path, 3600);
      return { ...r, source_type: "patient_upload", patient: patientMap[r.patient_id] ?? null, signed_url: signed?.signedUrl ?? null };
    }));
    const labReports = labRows.map((l: any) => ({
      id: `lab:${l.id}`,
      lab_order_id: l.id,
      hospital_id: l.hospital_id,
      patient_id: l.patient_id,
      doctor_id: l.ordered_by || l.referring_doctor_id,
      source_type: "lab_result",
      original_name: Array.isArray(l.tests) ? l.tests.join(", ") : "Lab results",
      title: "Lab results",
      notes: l.notes,
      mime_type: "application/lab-result",
      created_at: l.completed_at || l.created_at,
      ai_status: "done",
      ai_summary: (labResults[l.id] ?? []).map((r: any) => `${r.test_name}: ${r.value ?? "—"}${r.unit ? ` ${r.unit}` : ""}${r.flag ? ` (${r.flag})` : ""}`).join("\n"),
      lab_results: labResults[l.id] ?? [],
      patient: patientMap[l.patient_id] ?? null,
      signed_url: null,
    }));
    return [...withUrls, ...labReports]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  });

/** Doctor or patient: run AI to summarize, explain & suggest treatment.
 *  Works for image reports (multimodal) and PDF/text reports (text-extract path uses caption-only). */
export const analyzePatientReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ report_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: rep, error } = await supabaseAdmin
      .from("patient_reports").select("*")
      .eq("id", data.report_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!rep) throw new Error("Report not found");

    const { data: pat } = await supabaseAdmin
      .from("patients")
      .select("user_id, first_name, last_name, dob, gender, sex, blood_group, cnic, mrn")
      .eq("id", rep.patient_id)
      .maybeSingle();

    // Authorize: caller must own the patient or be staff of the report's hospital
    const ownerUid = pat?.user_id;
    if (ownerUid !== userId) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", userId).eq("hospital_id", rep.hospital_id).limit(1);
      if (!roles?.length) throw new Error("Forbidden");
    }

    await supabaseAdmin.from("patient_reports")
      .update({ ai_status: "running", ai_error: null }).eq("id", rep.id);

    try {
      const isImage = (rep.mime_type || "").startsWith("image/");
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET).createSignedUrl(rep.storage_path, 600);
      const fileUrl = signed?.signedUrl;
      if (!fileUrl) throw new Error("Could not access uploaded file");

      const patient = (pat || {}) as any;
      const age = patient.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
      const ctx = [
        `Patient: ${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim(),
        age != null ? `Age: ${age}` : null,
        patient.gender || patient.sex ? `Sex: ${patient.gender || patient.sex}` : null,
        patient.blood_group ? `Blood group: ${patient.blood_group}` : null,
        patient.mrn ? `MRN: ${patient.mrn}` : null,
        rep.title ? `Report title: ${rep.title}` : null,
        rep.notes ? `Patient notes: ${rep.notes}` : null,
        `File: ${rep.original_name}`,
      ].filter(Boolean).join("\n");

      const systemPrompt = `You are a clinical decision-support assistant. Analyze the medical report and return three clearly separated sections:
1) SUMMARY — 2-4 lines, plain English overview of the findings.
2) EXPLANATION — Explain abnormal/notable values & what they mean for the patient. Use bullet points. Be specific.
3) SUGGESTED TREATMENT — Practical, evidence-based next steps (lifestyle, follow-up tests, common medication classes WITHOUT specific brand+dose unless universally safe). Always end with: "These suggestions assist the physician; final decisions rest with the treating doctor."
Format strictly as:
## SUMMARY
...
## EXPLANATION
...
## SUGGESTED TREATMENT
...`;

      const userParts: any[] = [{ type: "text", text: `${ctx}\n\nPlease analyze the attached report.` }];
      if (isImage) {
        userParts.push({ type: "image", image: fileUrl });
      } else {
        userParts.push({ type: "text", text: `Report file (${rep.mime_type || "binary"}) URL: ${fileUrl}\nIf you cannot read attachments, infer from the title and patient notes.` });
      }

      const { text } = await generateText({
        model: aiModel(),
        system: systemPrompt,
        messages: [{ role: "user", content: userParts as any }],
      });

      const split = (label: string) => {
        const re = new RegExp(`##\\s*${label}\\s*([\\s\\S]*?)(?=##\\s|$)`, "i");
        const m = text.match(re);
        return m ? m[1].trim() : null;
      };
      const summary = split("SUMMARY") || text.slice(0, 400);
      const explanation = split("EXPLANATION") || "";
      const treatment = split("SUGGESTED TREATMENT") || "";

      await supabaseAdmin.from("patient_reports").update({
        ai_summary: summary,
        ai_explanation: explanation,
        ai_treatment: treatment,
        ai_status: "done",
        analyzed_at: new Date().toISOString(),
      }).eq("id", rep.id);

      // Notify the doctor that AI analysis is ready
      if (rep.doctor_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: rep.doctor_id,
          hospital_id: rep.hospital_id,
          type: "patient.report_analyzed",
          title: "AI analyzed a patient report",
          body: `${rep.original_name} — summary ready.`,
          data: { report_id: rep.id, patient_id: rep.patient_id },
        });
      }

      return { ok: true, summary, explanation, treatment };
    } catch (e: any) {
      await supabaseAdmin.from("patient_reports").update({
        ai_status: "error", ai_error: String(e?.message || e),
      }).eq("id", rep.id);
      throw new Error(e?.message || "AI analysis failed");
    }
  });

/** Delete a report (patient owns it or staff in same hospital). */
export const deletePatientReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ report_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: rep } = await supabaseAdmin
      .from("patient_reports").select("id, storage_path, uploaded_by, hospital_id, patient_id")
      .eq("id", data.report_id).maybeSingle();
    if (!rep) throw new Error("Report not found");
    const { data: pat } = await supabaseAdmin
      .from("patients")
      .select("user_id")
      .eq("id", rep.patient_id)
      .maybeSingle();
    if (rep.uploaded_by !== userId && pat?.user_id !== userId) {
      // staff path - verify hospital membership
      const { data: roles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", userId).eq("hospital_id", rep.hospital_id);
      if (!roles?.length) throw new Error("Forbidden");
    }
    await supabaseAdmin.storage.from(BUCKET).remove([rep.storage_path]);
    const { error } = await supabaseAdmin.from("patient_reports").delete().eq("id", rep.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
