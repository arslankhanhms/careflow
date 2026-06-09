import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { notifyPatientByChannels } from "@/integrations/twilio.server";

const bookSchema = z.object({
  hospitalSlug: z.string().min(1).max(100),
  doctorId: z.string().uuid(),
  slotStart: z.string(),
  slotEnd: z.string(),
  patient: z.object({
    fullName: z.string().min(2).max(120),
    phone: z.string().min(5).max(30),
    gender: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
    dob: z.string().optional(),
    cnic: z.string().min(5).max(30).optional(),
    address: z.string().max(500).optional(),
    diseases: z.string().max(500).optional(),
    allergies: z.string().max(500).optional(),
    reason: z.string().max(500).optional(),
  }),
  payment: z.object({
    method: z.enum(["cash_at_reception", "jazzcash", "easypaisa", "bank_transfer"]),
    txnId: z.string().max(120).optional(),
    receiptUrl: z.string().url().max(1000).optional(),
    payerName: z.string().max(120).optional(),
  }).optional(),
});

/** Book an appointment. Patient must be signed in. Creates/links patient row in target hospital. */
export const bookAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bookSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: hosp, error: hErr } = await supabaseAdmin
      .from("hospitals").select("id, name").eq("slug", data.hospitalSlug).eq("status", "active").maybeSingle();
    if (hErr) throw new Error(hErr.message);
    if (!hosp) throw new Error("Hospital not found");

    const { data: doc, error: dErr } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, display_name, consultation_fee, max_patients_per_day, hospital_id")
      .eq("id", data.doctorId).eq("is_doctor", true).maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!doc || doc.hospital_id !== hosp.id) throw new Error("Doctor not found");

    // Capacity check
    const dayStart = new Date(new Date(data.slotStart).toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
    const dayEnd = new Date(new Date(data.slotStart).toISOString().slice(0, 10) + "T23:59:59Z").toISOString();
    const { data: dayAppts, count } = await supabaseAdmin
      .from("appointments")
      .select("id, slot_start", { count: "exact" })
      .eq("doctor_id", doc.user_id!)
      .gte("slot_start", dayStart).lte("slot_start", dayEnd)
      .neq("status", "cancelled");
    const cap = doc.max_patients_per_day ?? 50;
    if ((count ?? 0) >= cap) throw new Error("FULL");

    // Leave check — block booking on doctor's leave dates
    const slotDate = new Date(data.slotStart).toISOString().slice(0, 10);
    const { data: leaves } = await supabaseAdmin
      .from("doctor_leaves")
      .select("id")
      .eq("doctor_user_id", doc.user_id!)
      .eq("status", "active")
      .lte("starts_on", slotDate)
      .gte("ends_on", slotDate)
      .limit(1);
    if (leaves && leaves.length > 0) {
      throw new Error("Doctor is on leave on the selected date. Please choose another date.");
    }

    const requestedSlotMs = new Date(data.slotStart).getTime();
    if ((dayAppts ?? []).some((a: any) => new Date(a.slot_start).getTime() === requestedSlotMs)) {
      throw new Error("Slot already taken — please pick another time.");
    }

    // Upsert patient (per hospital, by cnic if provided, else by user_id)
    const [first, ...rest] = data.patient.fullName.trim().split(/\s+/);
    const last = rest.join(" ") || "-";
    let patientId: string | null = null;
    if (data.patient.cnic) {
      const { data: existing } = await supabaseAdmin
        .from("patients").select("id").eq("hospital_id", hosp.id).eq("cnic", data.patient.cnic).maybeSingle();
      patientId = existing?.id ?? null;
    }
    if (!patientId) {
      const { data: existingByUser } = await supabaseAdmin
        .from("patients").select("id").eq("hospital_id", hosp.id).eq("user_id", userId).maybeSingle();
      patientId = existingByUser?.id ?? null;
    }
    if (!patientId) {
      const mrn = "MRN-" + Math.floor(100000 + Math.random() * 899999);
      const { data: newPat, error: pErr } = await supabaseAdmin
        .from("patients").insert({
          hospital_id: hosp.id, user_id: userId,
          first_name: first, last_name: last,
          phone: data.patient.phone, gender: data.patient.gender,
          dob: data.patient.dob || null,
          cnic: data.patient.cnic || null,
          address: data.patient.address || null,
          allergies: data.patient.allergies ? [data.patient.allergies] : null,
          chronic_conditions: data.patient.diseases ? [data.patient.diseases] : null,
          mrn,
        }).select("id").single();
      if (pErr) throw new Error(pErr.message);
      patientId = newPat.id;
    }

    const queueNo = (count ?? 0) + 1;
    const fee = Number(doc.consultation_fee || 0);
    const pay = data.payment;
    // If they sent an online txn, mark as pending verification; cash_at_reception stays unpaid.
    const apptPaymentStatus = pay && pay.method !== "cash_at_reception" ? "pending" : "unpaid";

    const { data: appt, error: aErr } = await supabaseAdmin
      .from("appointments").insert({
        hospital_id: hosp.id,
        patient_id: patientId,
        doctor_id: doc.user_id,
        scheduled_at: data.slotStart,
        slot_start: data.slotStart,
        slot_end: data.slotEnd,
        status: "scheduled",
        type: "consultation",
        reason: data.patient.reason || null,
        queue_no: queueNo,
        consultation_fee: fee,
        payment_status: apptPaymentStatus,
      }).select("id").single();
    if (aErr) {
      if ((aErr as any).code === "23505" || /duplicate|unique/i.test(aErr.message)) {
        throw new Error("Slot already taken — please pick another time.");
      }
      throw new Error(aErr.message);
    }

    // Record payment intent (only when patient submitted a method)
    if (pay && fee > 0) {
      await supabaseAdmin.from("payments").insert({
        hospital_id: hosp.id,
        patient_id: patientId,
        appointment_id: appt.id,
        amount: fee,
        method: pay.method,
        txn_id: pay.txnId || null,
        status: pay.method === "cash_at_reception" ? "pending" : "pending",
        metadata: {
          payer_name: pay.payerName || null,
          receipt_url: pay.receiptUrl || null,
          source: "patient_booking",
        },
      });
    }

    // Notify the doctor (in-app)
    await supabaseAdmin.from("notifications").insert({
      user_id: doc.user_id!, hospital_id: hosp.id,
      type: "appointment.new",
      title: "New appointment booked",
      body: `${data.patient.fullName} — queue #${queueNo}${pay ? ` · payment: ${pay.method}` : ""}`,
      data: { appointment_id: appt.id },
    });

    // Notify receptionists for EVERY new booking (queue management + payment verification)
    const { data: recs } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("hospital_id", hosp.id).eq("role", "receptionist");
    const needsVerify = pay && pay.method !== "cash_at_reception";
    for (const r of recs ?? []) {
      await supabaseAdmin.from("notifications").insert({
        user_id: r.user_id, hospital_id: hosp.id,
        type: needsVerify ? "payment.verify" : "appointment.new",
        title: needsVerify ? "Payment verification needed" : "New appointment in queue",
        body: needsVerify
          ? `${data.patient.fullName} paid Rs ${fee.toLocaleString()} via ${pay!.method}${pay!.txnId ? ` (Txn ${pay!.txnId})` : ""}`
          : `${data.patient.fullName} → Dr ${doc.display_name} · queue #${queueNo}`,
        data: { appointment_id: appt.id },
      });
    }

    // External notification to patient (SMS / WhatsApp via hospital's Twilio)
    await notifyPatientByChannels({
      hospitalId: hosp.id,
      phone: data.patient.phone,
      message: `${hosp.name}: appointment booked with Dr ${doc.display_name} on ${new Date(data.slotStart).toLocaleString()}. Queue #${queueNo}.`,
    });

    return {
      appointmentId: appt.id,
      queueNo,
      hospital: { name: hosp.name, slug: data.hospitalSlug },
      doctor: { name: doc.display_name, fee: doc.consultation_fee },
    };
  });

/** Get current patient's bookings across all hospitals. */
export const getMyAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: patientRows } = await supabaseAdmin
      .from("patients").select("id, hospital_id, mrn, pmr_no").eq("user_id", userId);
    const ids = (patientRows ?? []).map((p: any) => p.id);
    if (!ids.length) return { appointments: [], patients: [] };

    const { data: appts } = await supabaseAdmin
      .from("appointments")
      .select("id, scheduled_at, slot_start, slot_end, status, queue_no, consultation_fee, payment_status, hospital_id, doctor_id, reason")
      .in("patient_id", ids)
      .order("scheduled_at", { ascending: false })
      .limit(50);

    const hospIds = Array.from(new Set((appts ?? []).map((a: any) => a.hospital_id).filter(Boolean)));
    const docIds = Array.from(new Set((appts ?? []).map((a: any) => a.doctor_id).filter(Boolean)));
    const [{ data: hosps }, { data: docs }] = await Promise.all([
      supabaseAdmin.from("hospitals").select("id, name, slug").in("id", hospIds.length ? hospIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("user_id, display_name, specialization").in("user_id", docIds.length ? docIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    return {
      appointments: (appts ?? []).map((a: any) => ({
        ...a,
        hospital: hosps?.find((h: any) => h.id === a.hospital_id) ?? null,
        doctor: docs?.find((d: any) => d.user_id === a.doctor_id) ?? null,
      })),
      patients: patientRows ?? [],
    };
  });

/** Get current patient's prescriptions, payments, follow-ups (basic). */
export const getMyPortalData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: patients } = await supabaseAdmin
      .from("patients").select("id, hospital_id").eq("user_id", userId);
    const ids = (patients ?? []).map((p: any) => p.id);
    if (!ids.length) return { prescriptions: [], payments: [], followUps: [] };

    const [{ data: rx }, { data: pays }, { data: fups }] = await Promise.all([
      supabaseAdmin.from("prescriptions")
        .select("id, issued_at, diagnosis, medications, hospital_id")
        .in("patient_id", ids).order("issued_at", { ascending: false }).limit(20),
      supabaseAdmin.from("payments")
        .select("id, amount, method, status, txn_id, receipt_no, created_at, hospital_id, appointment_id")
        .in("patient_id", ids).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("follow_ups")
        .select("id, due_date, notes, hospital_id, appointment_id")
        .in("patient_id", ids).order("due_date", { ascending: true }).limit(20),
    ]);
    return { prescriptions: rx ?? [], payments: pays ?? [], followUps: fups ?? [] };
  });

/** Reschedule an appointment (patient-side). Validates ownership + capacity + new queue number. */
export const reschedulePatientAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      appointmentId: z.string().uuid(),
      slotStart: z.string(),
      slotEnd: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: patients } = await supabaseAdmin
      .from("patients").select("id").eq("user_id", userId);
    const ids = (patients ?? []).map((p: any) => p.id);
    if (!ids.length) throw new Error("Not your appointment");

    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select("id, patient_id, doctor_id, hospital_id, status")
      .eq("id", data.appointmentId).maybeSingle();
    if (!appt || !ids.includes(appt.patient_id)) throw new Error("Not your appointment");
    if (appt.status === "completed" || appt.status === "cancelled") throw new Error("Cannot reschedule a finished appointment");

    // Capacity check for the new day
    const dayStart = new Date(new Date(data.slotStart).toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
    const dayEnd = new Date(new Date(data.slotStart).toISOString().slice(0, 10) + "T23:59:59Z").toISOString();
    const { data: dayAppts, count } = await supabaseAdmin
      .from("appointments")
      .select("id, slot_start", { count: "exact" })
      .eq("doctor_id", appt.doctor_id!)
      .gte("slot_start", dayStart).lte("slot_start", dayEnd)
      .neq("status", "cancelled")
      .neq("id", data.appointmentId);

    const { data: doc } = await supabaseAdmin
      .from("profiles").select("max_patients_per_day, display_name")
      .eq("user_id", appt.doctor_id!).maybeSingle();
    const cap = doc?.max_patients_per_day ?? 50;
    if ((count ?? 0) >= cap) throw new Error("Doctor is fully booked on that day");
    const requestedSlotMs = new Date(data.slotStart).getTime();
    if ((dayAppts ?? []).some((a: any) => new Date(a.slot_start).getTime() === requestedSlotMs)) {
      throw new Error("Slot already taken — please pick another time.");
    }

    const queueNo = (count ?? 0) + 1;
    const { error } = await supabaseAdmin
      .from("appointments").update({
        scheduled_at: data.slotStart,
        slot_start: data.slotStart,
        slot_end: data.slotEnd,
        queue_no: queueNo,
        status: "scheduled",
      }).eq("id", data.appointmentId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: appt.doctor_id!, hospital_id: appt.hospital_id,
      type: "appointment.rescheduled",
      title: "Appointment rescheduled",
      body: `Patient moved their appointment to ${new Date(data.slotStart).toLocaleString()} — queue #${queueNo}`,
      data: { appointment_id: data.appointmentId },
    });

    return { ok: true, queueNo };
  });

/** Cancel an appointment (patient-side). */
export const cancelMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ appointmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: patients } = await supabaseAdmin
      .from("patients").select("id").eq("user_id", userId);
    const ids = (patients ?? []).map((p: any) => p.id);
    if (!ids.length) throw new Error("Not your appointment");
    const { data: appt } = await supabaseAdmin
      .from("appointments").select("id, patient_id").eq("id", data.appointmentId).maybeSingle();
    if (!appt || !ids.includes(appt.patient_id)) throw new Error("Not your appointment");
    const { error } = await supabaseAdmin
      .from("appointments").update({ status: "cancelled" }).eq("id", data.appointmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
