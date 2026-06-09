import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Doctor proposes a concession amount on an appointment. */
export const requestConcession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      appointment_id: z.string().uuid(),
      amount: z.number().min(0).max(10_000_000),
      reason: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: appt, error } = await supabase
      .from("appointments")
      .select("id, hospital_id, patient_id, doctor_id, consultation_fee, patient:patients(first_name,last_name,mrn)")
      .eq("id", data.appointment_id)
      .maybeSingle();
    if (error || !appt) throw new Error(error?.message || "Appointment not found");

    const { data: req, error: rErr } = await supabase
      .from("concession_requests")
      .insert({
        hospital_id: appt.hospital_id,
        appointment_id: appt.id,
        patient_id: appt.patient_id,
        doctor_id: appt.doctor_id || userId,
        amount: data.amount,
        reason: data.reason || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (rErr) throw new Error(rErr.message);

    // Notify receptionists + admins
    const { data: staff } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .eq("hospital_id", appt.hospital_id)
      .in("role", ["receptionist", "accountant", "hospital_admin", "owner"]);

    const patientName = `${(appt as any).patient?.first_name ?? ""} ${(appt as any).patient?.last_name ?? ""}`.trim() || "Patient";
    if (staff?.length) {
      await supabaseAdmin.from("notifications").insert(
        staff.map((s: any) => ({
          user_id: s.user_id,
          hospital_id: appt.hospital_id,
          type: "concession.request",
          title: "Concession request",
          body: `Doctor requested Rs ${data.amount.toLocaleString()} concession for ${patientName}.`,
          data: { request_id: req.id, appointment_id: appt.id, amount: data.amount },
        })),
      );
    }
    return { ok: true, request_id: req.id };
  });

export const listConcessionRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]).default("pending"),
      mine: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: hosp } = await supabaseAdmin.from("hospitals").select("id").eq("slug", data.slug).maybeSingle();
    if (!hosp) throw new Error("Hospital not found");

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .or(`hospital_id.eq.${hosp.id},role.eq.super_admin`);
    if (!roleRows?.length) throw new Error("Forbidden");

    let q = supabaseAdmin
      .from("concession_requests")
      .select("id, appointment_id, patient_id, doctor_id, amount, reason, status, decision_note, decided_at, created_at")
      .eq("hospital_id", hosp.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.mine) q = q.eq("doctor_id", userId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich manually so the receptionist page never depends on fragile embedded joins/RLS relationship resolution.
    const docIds = Array.from(new Set((rows ?? []).map((r: any) => r.doctor_id).filter(Boolean)));
    const patientIds = Array.from(new Set((rows ?? []).map((r: any) => r.patient_id).filter(Boolean)));
    const appointmentIds = Array.from(new Set((rows ?? []).map((r: any) => r.appointment_id).filter(Boolean)));
    let docMap: Record<string, string> = {};
    let patientMap: Record<string, any> = {};
    let appointmentMap: Record<string, any> = {};
    const [docsRes, patientsRes, appointmentsRes] = await Promise.all([
      docIds.length
        ? supabaseAdmin.from("profiles").select("user_id, display_name").in("user_id", docIds)
        : Promise.resolve({ data: [] as any[] }),
      patientIds.length
        ? supabaseAdmin.from("patients").select("id, first_name, last_name, mrn").in("id", patientIds)
        : Promise.resolve({ data: [] as any[] }),
      appointmentIds.length
        ? supabaseAdmin.from("appointments").select("id, consultation_fee, concession_amount, scheduled_at").in("id", appointmentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (docIds.length) {
      docMap = Object.fromEntries(((docsRes as any).data ?? []).map((d: any) => [d.user_id, d.display_name]));
    }
    patientMap = Object.fromEntries(((patientsRes as any).data ?? []).map((p: any) => [p.id, p]));
    appointmentMap = Object.fromEntries(((appointmentsRes as any).data ?? []).map((a: any) => [a.id, a]));
    return {
      requests: (rows ?? []).map((r: any) => ({
        ...r,
        patient: patientMap[r.patient_id] ?? null,
        appointment: appointmentMap[r.appointment_id] ?? null,
        doctor_name: docMap[r.doctor_id] || "Doctor",
      })),
    };
  });

export const decideConcessionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      request_id: z.string().uuid(),
      decision: z.enum(["approve", "reject"]),
      note: z.string().max(300).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: req, error } = await supabaseAdmin
      .from("concession_requests")
      .select("id, hospital_id, appointment_id, patient_id, doctor_id, amount, reason, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (error || !req) throw new Error(error?.message || "Request not found");
    if (req.status !== "pending") throw new Error("This request was already decided");

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("hospital_id", req.hospital_id)
      .in("role", ["receptionist", "accountant", "hospital_admin", "owner"]);
    const { data: superRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRows?.length && !superRole) throw new Error("Forbidden");

    const newStatus = data.decision === "approve" ? "approved" : "rejected";

    const { error: uErr } = await supabaseAdmin
      .from("concession_requests")
      .update({
        status: newStatus,
        decided_by: userId,
        decided_at: new Date().toISOString(),
        decision_note: data.note || null,
      })
      .eq("id", req.id);
    if (uErr) throw new Error(uErr.message);

    // If approved, write the concession amount onto the appointment row
    if (newStatus === "approved") {
      await supabaseAdmin
        .from("appointments")
        .update({
          concession_amount: Number(req.amount || 0),
          concession_reason: req.reason || null,
        })
        .eq("id", req.appointment_id);
    }

    // Notify the requesting doctor
    const { data: patient } = req.patient_id
      ? await supabaseAdmin.from("patients").select("first_name,last_name,mrn").eq("id", req.patient_id).maybeSingle()
      : { data: null as any };
    const patientName = `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim() || "Patient";
    const title = newStatus === "approved" ? "Concession approved" : "Concession rejected";
    const body = newStatus === "approved"
      ? `Receptionist gave Rs ${Number(req.amount).toLocaleString()} concession to ${patientName}.`
      : `Concession request for ${patientName} was rejected${data.note ? ` (${data.note})` : ""}.`;
    if (req.doctor_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: req.doctor_id,
        hospital_id: req.hospital_id,
        type: `concession.${newStatus}`,
        title,
        body,
        data: { request_id: req.id, appointment_id: req.appointment_id, amount: req.amount },
      });
    }
    return { ok: true, status: newStatus };
  });
