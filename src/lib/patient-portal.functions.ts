import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTwilioMessage } from "@/integrations/twilio.server";

/** Send the current patient's prescription to their own WhatsApp number via the
 *  hospital's configured Twilio account. Returns ok=false when the hospital has
 *  no WhatsApp credentials so the UI can fall back to email/copy. */
export const sharePrescriptionViaWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prescriptionId: z.string().uuid(), phone: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: rx } = await supabaseAdmin
      .from("prescriptions")
      .select("id, issued_at, diagnosis, medications, notes, hospital_id, patient_id, doctor_id")
      .eq("id", data.prescriptionId).maybeSingle();
    if (!rx) throw new Error("Prescription not found");

    const { data: patient } = await supabaseAdmin
      .from("patients").select("user_id, phone, first_name, cnic").eq("id", rx.patient_id).maybeSingle();
    if (!patient) throw new Error("Patient not found");

    // Authorize: caller must own this patient record (by user_id or matching CNIC)
    const { data: mine } = await supabaseAdmin
      .from("patients").select("id, cnic").eq("user_id", userId);
    const cnics = new Set((mine ?? []).map((p: any) => p.cnic).filter(Boolean));
    if (patient.user_id !== userId && !(patient.cnic && cnics.has(patient.cnic))) {
      throw new Error("Not authorized");
    }

    const to = (data.phone || patient.phone || "").trim();
    if (!to) return { ok: false, skipped: "no_phone" as const };

    const { data: hosp } = await supabaseAdmin
      .from("hospitals").select("name").eq("id", rx.hospital_id).maybeSingle();
    const { data: doc } = rx.doctor_id ? await supabaseAdmin
      .from("profiles").select("display_name, specialization").eq("user_id", rx.doctor_id).maybeSingle()
      : { data: null as any };

    const meds = ((rx.medications as any[]) || []).map((m, i) =>
      `${i + 1}. ${m.name || ""} — ${m.dosage || ""}${m.frequency ? ` · ${m.frequency}` : ""}${m.duration ? ` · ${m.duration}` : ""}${m.instructions ? `\n   (${m.instructions})` : ""}`
    ).join("\n");

    const body = [
      `*Prescription* — ${hosp?.name ?? ""}`,
      doc ? `Doctor: ${doc.display_name}${doc.specialization ? ` (${doc.specialization})` : ""}` : null,
      `Date: ${new Date(rx.issued_at).toLocaleString()}`,
      rx.diagnosis ? `Diagnosis: ${rx.diagnosis}` : null,
      "",
      meds || "No medications listed.",
      rx.notes ? `\nNotes: ${rx.notes}` : null,
    ].filter(Boolean).join("\n");

    const res = await sendTwilioMessage({
      hospitalId: rx.hospital_id, to, body, channel: "whatsapp",
    });
    if (!res.ok && !res.skipped) throw new Error(res.error || "Failed to send");
    return res;
  });

const CNIC_RE = /^[0-9]{5}-?[0-9]{7}-?[0-9]$|^[0-9]{13}$/;
const normalizeCnic = (raw: string) => raw.replace(/[^0-9]/g, "");
const cnicToEmail = (cnic: string) => `${normalizeCnic(cnic)}@patients.mediflow.local`;

/** Build a deterministic email for CNIC-based patient accounts.
 * Client uses this to sign in with supabase.auth.signInWithPassword. */
export const lookupPatientLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ cnic: z.string().min(5).max(20) }).parse(d))
  .handler(async ({ data }) => {
    if (!CNIC_RE.test(data.cnic.trim())) throw new Error("Enter a valid 13-digit CNIC");
    return { email: cnicToEmail(data.cnic) };
  });

/** Look up the email tied to a CNIC. Returns { exists, email } so the client can
 *  call supabase.auth.signInWithPassword({ email, password }). */
export const patientLoginLookup = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ cnic: z.string().min(5).max(20) }).parse(d))
  .handler(async ({ data }) => {
    if (!CNIC_RE.test(data.cnic.trim())) throw new Error("Enter a valid 13-digit CNIC");
    const cnic = normalizeCnic(data.cnic);
    const email = cnicToEmail(cnic);
    const { data: patientRow } = await supabaseAdmin
      .from("patients").select("id").eq("cnic", cnic).limit(1).maybeSingle();
    if (!patientRow) return { exists: false as const };
    return { exists: true as const, email };
  });

/** Reject bookings whose slot is in the past or after the doctor's working
 *  hours on that date. Reads working_hours from profiles. */
async function assertSlotWithinWorkingHours(doctorProfileId: string, slotStartISO: string) {
  const { data: prof } = await supabaseAdmin
    .from("profiles").select("working_hours").eq("id", doctorProfileId).maybeSingle();
  const wh = (prof?.working_hours ?? { start: "09:00", end: "17:00" }) as { start: string; end: string };
  const slot = new Date(slotStartISO);
  if (slot.getTime() <= Date.now()) {
    throw new Error("This time has already passed. Please pick a later slot or another date.");
  }
  const ymd = slotStartISO.slice(0, 10);
  const endDate = new Date(`${ymd}T${wh.end}:00`);
  if (slot >= endDate) {
    throw new Error(`Doctor's hours end at ${wh.end} on this date. Please book for the next available day.`);
  }
}


/** PUBLIC booking by CNIC. Auto-creates the patient auth user + patient row.
 *  Password is REQUIRED: it becomes the patient's permanent password. If the
 *  account already exists, the provided password must match (we never silently
 *  overwrite an existing password).
 *  Returns { email } so the client can sign in with the user's chosen password. */
export const bookAppointmentPublic = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      hospitalSlug: z.string().min(1).max(120),
      doctorId: z.string().uuid(),
      slotStart: z.string(),
      slotEnd: z.string(),
      patient: z.object({
        fullName: z.string().min(2).max(120),
        fatherName: z.string().max(120).optional(),
        cnic: z.string().min(5).max(20),
        phone: z.string().min(5).max(30),
        gender: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
        sex: z.string().max(30).optional(),
        weightKg: z.number().positive().max(500).optional(),
        dob: z.string().optional(),
        address: z.string().max(500).optional(),
        diseases: z.string().max(500).optional(),
        allergies: z.string().max(500).optional(),
        bloodGroup: z.enum(["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"]).optional(),
        reason: z.string().max(500).optional(),
      }),
      password: z.string().min(6).max(128),
      payment: z.object({
        method: z.enum(["cash_at_reception", "jazzcash", "easypaisa", "bank_transfer"]),
        txnId: z.string().max(120).optional(),
        payerName: z.string().max(120).optional(),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    if (!CNIC_RE.test(data.patient.cnic.trim())) throw new Error("Enter a valid 13-digit CNIC");
    const cnic = normalizeCnic(data.patient.cnic);
    const email = cnicToEmail(cnic);

    const { data: hosp } = await supabaseAdmin
      .from("hospitals").select("id, name").eq("slug", data.hospitalSlug).eq("status", "active").maybeSingle();
    if (!hosp) throw new Error("Hospital not found");

    const { data: doc } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, display_name, consultation_fee, max_patients_per_day, hospital_id")
      .eq("id", data.doctorId).eq("is_doctor", true).maybeSingle();
    if (!doc || doc.hospital_id !== hosp.id) throw new Error("Doctor not found");

    // Find or create auth user (deterministic CNIC email)
    let userId: string | null = null;
    const { data: existingProf } = await supabaseAdmin
      .from("profiles").select("user_id").eq("cnic", cnic).maybeSingle();
    userId = existingProf?.user_id ?? null;

    if (!userId) {
      // New account — set the user's chosen password.
      const created = await supabaseAdmin.auth.admin.createUser({
        email, password: data.password, email_confirm: true,
        user_metadata: { display_name: data.patient.fullName, cnic, is_patient: true },
      });
      if (created.error) throw new Error(created.error.message);
      userId = created.data.user!.id;
      await supabaseAdmin.from("profiles").upsert({
        user_id: userId, email, display_name: data.patient.fullName,
        phone: data.patient.phone || null, cnic,
      }, { onConflict: "user_id" });
    } else {
      // Existing account — verify the password matches BEFORE proceeding. We do
      // this by attempting a sign-in via the public Supabase API (admin client
      // can't verify passwords). If wrong, the booking is rejected so we never
      // silently overwrite an existing patient's password.
      const verifyClient = (await import("@supabase/supabase-js")).createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const verify = await verifyClient.auth.signInWithPassword({ email, password: data.password });
      if (verify.error) {
        throw new Error("An account with this CNIC already exists. Please enter your existing password.");
      }
    }

    await assertSlotWithinWorkingHours(data.doctorId, data.slotStart);
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
    const reqMs = new Date(data.slotStart).getTime();
    if ((dayAppts ?? []).some((a: any) => new Date(a.slot_start).getTime() === reqMs)) {
      throw new Error("Slot already taken — please pick another time.");
    }

    // Upsert patient row in this hospital
    const [first, ...rest] = data.patient.fullName.trim().split(/\s+/);
    const last = rest.join(" ") || "-";
    let patientId: string | null = null;
    const { data: existingPat } = await supabaseAdmin
      .from("patients").select("id").eq("hospital_id", hosp.id).eq("cnic", cnic).maybeSingle();
    if (existingPat) {
      patientId = existingPat.id;
      await supabaseAdmin.from("patients").update({
        user_id: userId, phone: data.patient.phone, address: data.patient.address || null,
        first_name: first, last_name: last,
        father_name: data.patient.fatherName || null,
        sex: data.patient.sex || data.patient.gender,
        weight_kg: data.patient.weightKg ?? null,
        blood_group: data.patient.bloodGroup && data.patient.bloodGroup !== "unknown" ? data.patient.bloodGroup : undefined,
      } as any).eq("id", patientId);
    } else {
      const mrn = "MRN-" + Math.floor(100000 + Math.random() * 899999);
      const ins0 = await supabaseAdmin.from("patients").insert({
        hospital_id: hosp.id, user_id: userId, mrn,
        first_name: first, last_name: last,
        father_name: data.patient.fatherName || null,
        phone: data.patient.phone, gender: data.patient.gender,
        sex: data.patient.sex || data.patient.gender,
        weight_kg: data.patient.weightKg ?? null,
        dob: data.patient.dob || null, cnic,
        address: data.patient.address || null,
        blood_group: data.patient.bloodGroup && data.patient.bloodGroup !== "unknown" ? data.patient.bloodGroup : null,
        allergies: data.patient.allergies ? [data.patient.allergies] : null,
        chronic_conditions: data.patient.diseases ? [data.patient.diseases] : null,
      } as any).select("id").single();
      if (ins0.error) throw new Error(ins0.error.message);
      patientId = ins0.data.id;
    }
    // Back-link cross-hospital rows with same CNIC
    await supabaseAdmin.from("patients").update({ user_id: userId } as any).eq("cnic", cnic).is("user_id", null);

    const queueNo = (count ?? 0) + 1;
    const fee = Number(doc.consultation_fee || 0);
    const pay = data.payment;
    const apptPaymentStatus = pay && pay.method !== "cash_at_reception" ? "pending" : "unpaid";

    const ins = await supabaseAdmin.from("appointments").insert({
      hospital_id: hosp.id, patient_id: patientId, doctor_id: doc.user_id,
      scheduled_at: data.slotStart, slot_start: data.slotStart, slot_end: data.slotEnd,
      status: "scheduled", type: "consultation", reason: data.patient.reason || null,
      queue_no: queueNo, consultation_fee: fee, payment_status: apptPaymentStatus,
    }).select("id").single();
    if (ins.error) throw new Error(ins.error.message);
    const apptId = ins.data.id;

    if (pay && fee > 0) {
      await supabaseAdmin.from("payments").insert({
        hospital_id: hosp.id, patient_id: patientId, appointment_id: apptId,
        amount: fee, method: pay.method, txn_id: pay.txnId || null, status: "pending",
        metadata: { payer_name: pay.payerName || null, source: "patient_booking_public" },
      });
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: doc.user_id!, hospital_id: hosp.id, type: "appointment.new",
      title: "New appointment booked",
      body: `${data.patient.fullName} — queue #${queueNo}`,
      data: { appointment_id: apptId },
    });
    const { data: recs } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("hospital_id", hosp.id).eq("role", "receptionist");
    for (const r of recs ?? []) {
      await supabaseAdmin.from("notifications").insert({
        user_id: r.user_id, hospital_id: hosp.id, type: "appointment.new",
        title: "New appointment in queue",
        body: `${data.patient.fullName} → Dr ${doc.display_name} · queue #${queueNo}`,
        data: { appointment_id: apptId },
      });
    }

    return {
      ok: true, appointmentId: apptId, queueNo,
      email,
      hospital: { name: hosp.name, slug: data.hospitalSlug },
      doctor: { name: doc.display_name, fee },
    };
  });

/** Patient: get unified view across every hospital that has my CNIC on file. */
export const getMyUnifiedPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // 1. Find this user's CNIC
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("cnic, display_name").eq("user_id", userId).maybeSingle();
    const cnic = prof?.cnic || null;

    // 2. Collect every patient row matched by user_id OR cnic, then back-link unlinked ones
    let patientRows: any[] = [];
    const byUser = await supabaseAdmin
      .from("patients").select("id, hospital_id, mrn, pmr_no, cnic, first_name, last_name, user_id").eq("user_id", userId);
    patientRows = byUser.data ?? [];

    if (cnic) {
      const byCnic = await supabaseAdmin
        .from("patients").select("id, hospital_id, mrn, pmr_no, cnic, first_name, last_name, user_id").eq("cnic", cnic);
      for (const r of byCnic.data ?? []) {
        if (!patientRows.find((p) => p.id === r.id)) patientRows.push(r);
      }
      // Back-link unlinked rows so RLS-respecting queries continue to work next time
      const toLink = (byCnic.data ?? []).filter((r) => !r.user_id).map((r) => r.id);
      if (toLink.length) {
        await supabaseAdmin.from("patients").update({ user_id: userId } as any).in("id", toLink);
      }
    }

    if (patientRows.length === 0) {
      return { patients: [], hospitals: [], appointments: [], prescriptions: [], payments: [], followUps: [], labOrders: [], cnic };
    }

    const ids = patientRows.map((p) => p.id);
    const hospIds = Array.from(new Set(patientRows.map((p) => p.hospital_id)));

    // 3. Fetch everything in parallel, scoped to those patient ids
    const [{ data: hosps }, { data: appts }, { data: rx }, { data: pays }, { data: fups }, { data: labs }] = await Promise.all([
      supabaseAdmin.from("hospitals").select("id, name, slug, logo_url, brand_color, city").in("id", hospIds),
      supabaseAdmin.from("appointments")
        .select("id, scheduled_at, slot_start, slot_end, status, queue_no, consultation_fee, payment_status, hospital_id, doctor_id, reason, patient_id")
        .in("patient_id", ids).order("scheduled_at", { ascending: false }).limit(100),
      supabaseAdmin.from("prescriptions")
        .select("id, issued_at, diagnosis, medications, hospital_id, patient_id, doctor_id, notes")
        .in("patient_id", ids).order("issued_at", { ascending: false }).limit(50),
      supabaseAdmin.from("payments")
        .select("id, amount, method, status, txn_id, receipt_no, created_at, hospital_id, appointment_id, patient_id, metadata")
        .in("patient_id", ids).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("follow_ups")
        .select("id, due_date, notes, hospital_id, appointment_id, patient_id")
        .in("patient_id", ids).order("due_date", { ascending: true }).limit(50),
      supabaseAdmin.from("lab_orders")
        .select("id, tests, status, priority, created_at, completed_at, hospital_id, patient_id, ordered_by")
        .in("patient_id", ids).order("created_at", { ascending: false }).limit(50),
    ]);

    // 4. Doctor names
    const docIds = Array.from(new Set([
      ...(appts ?? []).map((a: any) => a.doctor_id),
      ...(rx ?? []).map((p: any) => p.doctor_id),
    ].filter(Boolean)));
    const { data: docs } = docIds.length
      ? await supabaseAdmin.from("profiles").select("user_id, display_name, specialization").in("user_id", docIds)
      : { data: [] as any[] };

    // 5. Attach lab results
    const labIds = (labs ?? []).map((l: any) => l.id);
    const { data: labResults } = labIds.length
      ? await supabaseAdmin.from("lab_results")
          .select("id, lab_order_id, test_name, value, unit, reference_range, flag")
          .in("lab_order_id", labIds)
      : { data: [] as any[] };
    const resultsByOrder: Record<string, any[]> = {};
    for (const r of labResults ?? []) (resultsByOrder[r.lab_order_id] = resultsByOrder[r.lab_order_id] || []).push(r);

    const hMap = new Map((hosps ?? []).map((h: any) => [h.id, h]));
    const dMap = new Map((docs ?? []).map((d: any) => [d.user_id, d]));

    return {
      cnic,
      patients: patientRows,
      hospitals: hosps ?? [],
      appointments: (appts ?? []).map((a: any) => ({
        ...a, hospital: hMap.get(a.hospital_id) ?? null, doctor: dMap.get(a.doctor_id) ?? null,
      })),
      prescriptions: (rx ?? []).map((p: any) => ({
        ...p, hospital: hMap.get(p.hospital_id) ?? null, doctor: dMap.get(p.doctor_id) ?? null,
      })),
      payments: (pays ?? []).map((p: any) => ({ ...p, hospital: hMap.get(p.hospital_id) ?? null })),
      followUps: (fups ?? []).map((f: any) => ({ ...f, hospital: hMap.get(f.hospital_id) ?? null })),
      labOrders: (labs ?? []).map((l: any) => ({
        ...l, hospital: hMap.get(l.hospital_id) ?? null,
        doctor: l.ordered_by ? dMap.get(l.ordered_by) ?? null : null,
        results: resultsByOrder[l.id] ?? [],
      })),
    };
  });

/** Authenticated booking — used when the patient is already signed in on
 *  their dashboard. No password is required; we trust the auth session and
 *  pull/upsert patient details from the user's existing records. Returns the
 *  same shape as `bookAppointmentPublic` so the UI is interchangeable. */
export const bookAppointmentAsMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      hospitalSlug: z.string().min(1).max(120),
      doctorId: z.string().uuid(),
      slotStart: z.string(),
      slotEnd: z.string(),
      // All optional — server will fill from existing patient row if missing.
      patient: z.object({
        fullName: z.string().max(120).optional(),
        fatherName: z.string().max(120).optional(),
        phone: z.string().max(30).optional(),
        gender: z.enum(["male", "female", "other", "unknown"]).optional(),
        sex: z.string().max(30).optional(),
        weightKg: z.number().positive().max(500).optional(),
        dob: z.string().optional(),
        address: z.string().max(500).optional(),
        diseases: z.string().max(500).optional(),
        allergies: z.string().max(500).optional(),
        bloodGroup: z.enum(["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"]).optional(),
        reason: z.string().max(500).optional(),
      }).default({}),
      payment: z.object({
        method: z.enum(["cash_at_reception", "jazzcash", "easypaisa", "bank_transfer"]),
        txnId: z.string().max(120).optional(),
        payerName: z.string().max(120).optional(),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Find existing patient profile / row(s) for this user
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("cnic, display_name, phone").eq("user_id", userId).maybeSingle();
    const cnic = prof?.cnic || null;
    if (!cnic) throw new Error("Your account has no CNIC on file. Please complete your profile first.");

    // Pull the most recent patient row to use as default details source.
    const { data: existingPats } = await supabaseAdmin
      .from("patients")
      .select("id, hospital_id, first_name, last_name, father_name, phone, gender, sex, weight_kg, dob, address, allergies, chronic_conditions, cnic, user_id, mrn")
      .or(`user_id.eq.${userId},cnic.eq.${cnic}`)
      .order("created_at", { ascending: false });
    const source: any = (existingPats ?? [])[0];

    const { data: hosp } = await supabaseAdmin
      .from("hospitals").select("id, name").eq("slug", data.hospitalSlug).eq("status", "active").maybeSingle();
    if (!hosp) throw new Error("Hospital not found");

    const { data: doc } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, display_name, consultation_fee, max_patients_per_day, hospital_id")
      .eq("id", data.doctorId).eq("is_doctor", true).maybeSingle();
    if (!doc || doc.hospital_id !== hosp.id) throw new Error("Doctor not found");

    // Merge incoming patient overrides with stored values
    const fullName = data.patient.fullName?.trim()
      || (source ? `${source.first_name ?? ""} ${source.last_name ?? ""}`.trim() : "")
      || prof?.display_name
      || "Patient";
    const [first, ...rest] = fullName.split(/\s+/);
    const last = rest.join(" ") || "-";
    const phone = data.patient.phone || source?.phone || prof?.phone || "";
    const gender = data.patient.gender || source?.gender || "unknown";
    const address = data.patient.address ?? source?.address ?? null;
    const dob = data.patient.dob ?? source?.dob ?? null;
    const sex = data.patient.sex ?? source?.sex ?? gender;
    const weightKg = data.patient.weightKg ?? source?.weight_kg ?? null;
    const fatherName = data.patient.fatherName ?? source?.father_name ?? null;

    await assertSlotWithinWorkingHours(data.doctorId, data.slotStart);
    // Capacity & duplicate-slot checks
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
    const reqMs = new Date(data.slotStart).getTime();
    if ((dayAppts ?? []).some((a: any) => new Date(a.slot_start).getTime() === reqMs)) {
      throw new Error("Slot already taken — please pick another time.");
    }

    // Upsert patient row in target hospital
    let patientId: string | null = null;
    const { data: existingHere } = await supabaseAdmin
      .from("patients").select("id").eq("hospital_id", hosp.id).eq("cnic", cnic).maybeSingle();
    if (existingHere) {
      patientId = existingHere.id;
      await supabaseAdmin.from("patients").update({
        user_id: userId, phone, address,
        first_name: first, last_name: last, father_name: fatherName,
        sex, weight_kg: weightKg,
        blood_group: data.patient.bloodGroup && data.patient.bloodGroup !== "unknown" ? data.patient.bloodGroup : undefined,
      } as any).eq("id", patientId);
    } else {
      const mrn = "MRN-" + Math.floor(100000 + Math.random() * 899999);
      const ins0 = await supabaseAdmin.from("patients").insert({
        hospital_id: hosp.id, user_id: userId, mrn,
        first_name: first, last_name: last, father_name: fatherName,
        phone, gender, sex, weight_kg: weightKg,
        dob, cnic, address,
        blood_group: data.patient.bloodGroup && data.patient.bloodGroup !== "unknown" ? data.patient.bloodGroup : null,
        allergies: data.patient.allergies ? [data.patient.allergies] : (source?.allergies ?? null),
        chronic_conditions: data.patient.diseases ? [data.patient.diseases] : (source?.chronic_conditions ?? null),
      } as any).select("id").single();
      if (ins0.error) throw new Error(ins0.error.message);
      patientId = ins0.data.id;
    }

    const queueNo = (count ?? 0) + 1;
    const fee = Number(doc.consultation_fee || 0);
    const pay = data.payment;
    const apptPaymentStatus = pay && pay.method !== "cash_at_reception" ? "pending" : "unpaid";

    const ins = await supabaseAdmin.from("appointments").insert({
      hospital_id: hosp.id, patient_id: patientId, doctor_id: doc.user_id,
      scheduled_at: data.slotStart, slot_start: data.slotStart, slot_end: data.slotEnd,
      status: "scheduled", type: "consultation", reason: data.patient.reason || null,
      queue_no: queueNo, consultation_fee: fee, payment_status: apptPaymentStatus,
    }).select("id").single();
    if (ins.error) throw new Error(ins.error.message);
    const apptId = ins.data.id;

    if (pay && fee > 0) {
      await supabaseAdmin.from("payments").insert({
        hospital_id: hosp.id, patient_id: patientId, appointment_id: apptId,
        amount: fee, method: pay.method, txn_id: pay.txnId || null, status: "pending",
        metadata: { payer_name: pay.payerName || null, source: "patient_dashboard" },
      });
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: doc.user_id!, hospital_id: hosp.id, type: "appointment.new",
      title: "New appointment booked",
      body: `${fullName} — queue #${queueNo}`,
      data: { appointment_id: apptId },
    });
    const { data: recs } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("hospital_id", hosp.id).eq("role", "receptionist");
    for (const r of recs ?? []) {
      await supabaseAdmin.from("notifications").insert({
        user_id: r.user_id, hospital_id: hosp.id, type: "appointment.new",
        title: "New appointment in queue",
        body: `${fullName} → Dr ${doc.display_name} · queue #${queueNo}`,
        data: { appointment_id: apptId },
      });
    }

    return {
      ok: true, appointmentId: apptId, queueNo,
      hospital: { name: hosp.name, slug: data.hospitalSlug },
      doctor: { name: doc.display_name, fee },
    };
  });
