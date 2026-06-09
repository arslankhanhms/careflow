import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getHospitalId(supabase: any, slug: string) {
  const { data, error } = await supabase.from("hospitals").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hospital not found");
  return data.id as string;
}

export const listAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: hosp, error: hErr } = await supabase
      .from("hospitals").select("id, name, address, phone, city, email, logo_url, brand_color").eq("slug", data.slug).maybeSingle();
    if (hErr) throw new Error(hErr.message);
    if (!hosp) throw new Error("Hospital not found");
    const hid = hosp.id as string;
    const { data: rows, error } = await supabase
      .from("appointments")
      .select("*, patient:patients(first_name,last_name,mrn,phone,father_name,cnic,gender,sex,dob)")
      .eq("hospital_id", hid)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    // Hydrate doctor + latest payment (no FK; manual join)
    const docIds = Array.from(new Set((rows ?? []).map((r: any) => r.doctor_id).filter(Boolean)));
    const apptIds = (rows ?? []).map((r: any) => r.id);
    const [{ data: docs }, { data: pays }] = await Promise.all([
      docIds.length
        ? supabase.from("profiles").select("user_id, display_name, specialization").in("user_id", docIds)
        : Promise.resolve({ data: [] as any[] }),
      apptIds.length
        ? supabase.from("payments").select("appointment_id, method, amount, status, txn_id, reference_no, created_at, metadata").in("appointment_id", apptIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const payByAppt = new Map<string, any>();
    for (const p of (pays as any[]) ?? []) if (!payByAppt.has(p.appointment_id)) payByAppt.set(p.appointment_id, p);
    return {
      hospital: hosp,
      appointments: (rows ?? []).map((r: any) => {
        const pay = payByAppt.get(r.id) ?? null;
        return {
          ...r,
          doctor: (docs as any[])?.find((d) => d.user_id === r.doctor_id) ?? null,
          payment: pay,
          booking_source: pay?.metadata?.source === "patient_booking" ? "patient_portal" : "receptionist",
        };
      }),
    };
  });

export const updateAppointmentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      appointment_id: z.string().uuid(),
      payment_status: z.enum(["paid", "pending", "failed", "refunded", "unpaid"]),
      method: z.enum(["cash", "online", "jazzcash", "easypaisa", "bank_transfer", "card"]).optional(),
      amount: z.number().min(0).optional(),
      reference_no: z.string().max(120).optional().nullable(),
      txn_id: z.string().max(120).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: existingAppt, error: aErr } = await supabaseAdmin
      .from("appointments")
      .select("id, hospital_id, patient_id, doctor_id, consultation_fee")
      .eq("id", data.appointment_id)
      .single();
    if (aErr) throw new Error(aErr.message);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("hospital_id", existingAppt.hospital_id)
      .limit(1);
    if (!roles?.length) throw new Error("Forbidden");
    const { data: appt, error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ payment_status: data.payment_status, updated_at: new Date().toISOString() })
      .eq("id", data.appointment_id)
      .select("id, hospital_id, patient_id, doctor_id, consultation_fee")
      .single();
    if (updErr) throw new Error(updErr.message);

    const payStatusMap: Record<string, string> = {
      paid: "paid", pending: "pending", failed: "failed", refunded: "refunded", unpaid: "pending",
    };
    const { data: latestPay } = await supabaseAdmin
      .from("payments").select("id, method, amount, receipt_no, status").eq("appointment_id", data.appointment_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const receiptNo = latestPay?.receipt_no || "RCP-" + new Date().getFullYear() + "-" + Math.floor(100000 + Math.random() * 899999);

    const paymentPatch = {
      amount: data.amount ?? latestPay?.amount ?? Number(appt.consultation_fee || 0),
      method: data.method ?? latestPay?.method ?? "cash",
      status: payStatusMap[data.payment_status],
      txn_id: data.txn_id ?? null,
      reference_no: data.reference_no ?? null,
      receipt_no: receiptNo,
      updated_by: userId,
      updated_at: new Date().toISOString(),
      metadata: { source: "status_update", new_status: data.payment_status },
    } as any;
    const payRes = latestPay
      ? await supabaseAdmin.from("payments").update(paymentPatch).eq("id", latestPay.id)
      : await supabaseAdmin.from("payments").insert({
          hospital_id: appt.hospital_id,
          patient_id: appt.patient_id,
          appointment_id: appt.id,
          ...paymentPatch,
        } as any);
    if (payRes.error) throw new Error(payRes.error.message);

    // Notify doctor + patient
    const notifTitle = data.payment_status === "paid" ? "Payment confirmed"
      : data.payment_status === "failed" ? "Payment failed"
      : data.payment_status === "refunded" ? "Payment refunded"
      : "Payment status updated";
    const notifBody = `Appointment payment marked as ${data.payment_status}.`;
    if (appt.doctor_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: appt.doctor_id, hospital_id: appt.hospital_id,
        type: "payment.update", title: notifTitle, body: notifBody,
        data: { appointment_id: appt.id },
      });
    }
    const { data: pat } = await supabaseAdmin.from("patients").select("user_id").eq("id", appt.patient_id).maybeSingle();
    if (pat?.user_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: pat.user_id, hospital_id: appt.hospital_id,
        type: "payment.update", title: notifTitle, body: notifBody,
        data: { appointment_id: appt.id },
      });
    }
    return { ok: true };
  });

export const listPaymentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ appointment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("payments")
      .select("id, amount, method, status, txn_id, reference_no, updated_by, created_at, metadata")
      .eq("appointment_id", data.appointment_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.updated_by).filter(Boolean)));
    let updaters: any[] = [];
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds);
      updaters = profs ?? [];
    }
    return {
      history: (rows ?? []).map((r: any) => ({
        ...r,
        updated_by_name: updaters.find((u) => u.user_id === r.updated_by)?.display_name ?? null,
      })),
    };
  });

export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      patient_id: z.string().uuid().optional(),
      // Inline new-patient creation (receptionist flow)
      new_patient: z.object({
        first_name: z.string().min(1).max(80),
        last_name: z.string().min(1).max(80),
        phone: z.string().max(40).optional().nullable(),
        cnic: z.string().max(20).optional().nullable(),
        gender: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
        dob: z.string().optional().nullable(),
        email: z.string().email().optional().or(z.literal("")).nullable(),
        address: z.string().max(400).optional().nullable(),
      }).optional(),
      scheduled_at: z.string().min(1),
      duration_min: z.number().int().min(5).max(480).default(30),
      type: z.enum(["consultation", "followup", "procedure", "emergency", "telemedicine"]).default("consultation"),
      reason: z.string().max(500).optional(),
      doctor_id: z.string().uuid().optional().nullable(),
      consultation_fee: z.number().min(0).max(1_000_000).optional(),
      payment: z.object({
        method: z.enum(["cash", "online", "jazzcash", "easypaisa", "bank_transfer", "card"]),
        amount: z.number().min(0).max(1_000_000),
        txn_id: z.string().max(120).optional().nullable(),
        payer_name: z.string().max(120).optional().nullable(),
      }).optional(),
    }).refine((v) => v.patient_id || v.new_patient, { message: "Either patient_id or new_patient is required" })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);

    // Resolve / create patient
    let patientId = data.patient_id ?? null;
    if (!patientId && data.new_patient) {
      const np = data.new_patient;
      // De-dupe by CNIC if provided
      if (np.cnic) {
        const { data: existing } = await supabase
          .from("patients").select("id")
          .eq("hospital_id", hid).eq("cnic", np.cnic).maybeSingle();
        if (existing?.id) patientId = existing.id;
      }
      if (!patientId) {
        const { count } = await supabase.from("patients")
          .select("*", { count: "exact", head: true })
          .eq("hospital_id", hid);
        const mrn = `MR-${String((count ?? 0) + 1).padStart(5, "0")}`;
        const { data: newPat, error: pErr } = await supabase.from("patients").insert({
          hospital_id: hid,
          mrn,
          first_name: np.first_name,
          last_name: np.last_name,
          phone: np.phone || null,
          cnic: np.cnic || null,
          gender: np.gender,
          dob: np.dob || null,
          email: np.email || null,
          address: np.address || null,
        }).select("id").single();
        if (pErr) throw new Error(pErr.message);
        patientId = newPat.id;
      }
    }
    if (!patientId) throw new Error("Patient is required");

    const paymentStatus = data.payment
      ? (data.payment.method === "cash" ? "paid" : "pending")
      : "unpaid";

    const { data: row, error } = await supabase.from("appointments").insert({
      hospital_id: hid,
      patient_id: patientId,
      doctor_id: data.doctor_id || null,
      scheduled_at: data.scheduled_at,
      slot_start: data.scheduled_at,
      slot_end: new Date(new Date(data.scheduled_at).getTime() + data.duration_min * 60_000).toISOString(),
      duration_min: data.duration_min,
      type: data.type,
      reason: data.reason ?? null,
      consultation_fee: data.consultation_fee ?? data.payment?.amount ?? 0,
      payment_status: paymentStatus,
    }).select().single();
    if (error) {
      if ((error as any).code === "23505" || /duplicate|unique/i.test(error.message)) {
        throw new Error("Slot already taken — please pick another time.");
      }
      throw new Error(error.message);
    }

    // Record payment (if any)
    if (data.payment && data.payment.amount > 0) {
      await supabase.from("payments").insert({
        hospital_id: hid,
        patient_id: patientId,
        appointment_id: row.id,
        amount: data.payment.amount,
        method: data.payment.method,
        txn_id: data.payment.txn_id || null,
        status: data.payment.method === "cash" ? "completed" : "pending",
        updated_by: context.userId,
        metadata: {
          payer_name: data.payment.payer_name || null,
          source: "receptionist_booking",
        },
      } as any);
    }

    return { appointment: row, patient_id: patientId };
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["scheduled", "checked_in", "in_progress", "completed", "cancelled", "no_show"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("appointments").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("appointments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
