import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const hospitalSlug = z.object({ slug: z.string().min(1).max(80) });
const PATIENT_WRITE_ROLES = ["super_admin", "doctor", "nurse", "receptionist", "opd", "ward", "daycare"] as const;

async function canWritePatients(userId: string, hospitalId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role, hospital_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).some((r: any) =>
    r.role === "super_admin" || (r.hospital_id === hospitalId && PATIENT_WRITE_ROLES.includes(r.role)),
  );
}

/** List doctors of a hospital (any authenticated staff in the hospital). */
export const listHospitalDoctors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => hospitalSlug.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: h } = await supabase
      .from("hospitals").select("id").eq("slug", data.slug).maybeSingle();
    if (!h) return { doctors: [] };
    const { data: docs, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, specialization, department, consultation_fee")
      .eq("hospital_id", h.id)
      .eq("is_doctor", true)
      .order("display_name");
    if (error) throw new Error(error.message);
    return { doctors: docs ?? [] };
  });

/** Search patients in a hospital by MRN / CNIC / phone / name. */
export const searchHospitalPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ slug: z.string().min(1), query: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: h } = await supabase
      .from("hospitals").select("id").eq("slug", data.slug).maybeSingle();
    if (!h) return { patients: [] };
    const q = data.query.trim();
    const pattern = `%${q}%`;
    const { data: patients, error } = await supabase
      .from("patients")
      .select("id, mrn, pmr_no, first_name, last_name, cnic, phone, blood_group, allergies, dob, gender")
      .eq("hospital_id", h.id)
      .or(`mrn.ilike.${pattern},cnic.ilike.${pattern},phone.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},pmr_no.ilike.${pattern}`)
      .limit(30);
    if (error) throw new Error(error.message);
    return { patients: patients ?? [] };
  });

export const listPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => hospitalSlug.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: hospitals, error: hErr } = await supabase
      .from("hospitals").select("id, name").eq("slug", data.slug).maybeSingle();
    if (hErr) throw new Error(hErr.message);
    if (!hospitals) return { patients: [], hospital: null };
    const { data: patients, error } = await supabase
      .from("patients").select("*")
      .eq("hospital_id", hospitals.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { patients: patients ?? [], hospital: hospitals };
  });

export const createPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      first_name: z.string().min(1).max(80),
      last_name: z.string().min(1).max(80),
      father_name: z.string().max(120).optional().nullable(),
      gender: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
      sex: z.string().max(30).optional().nullable(),
      weight_kg: z.union([z.number(), z.string()]).optional().nullable(),
      dob: z.string().optional().nullable(),
      phone: z.string().max(40).optional().nullable(),
      email: z.string().email().optional().or(z.literal("")).nullable(),
      blood_group: z.string().max(8).optional().nullable(),
      allergies: z.string().max(500).optional().nullable(),
      address: z.string().max(400).optional().nullable(),
      cnic: z.string().max(20).optional().nullable(),
      assigned_doctor_id: z.string().uuid().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: hospital, error: hErr } = await supabase
      .from("hospitals").select("id").eq("slug", data.slug).maybeSingle();
    if (hErr) throw new Error(hErr.message);
    if (!hospital) throw new Error("Hospital not found");
    if (!(await canWritePatients(context.userId, hospital.id))) {
      throw new Error("View-only access: this role cannot add patients.");
    }

    const { count } = await supabase.from("patients")
      .select("*", { count: "exact", head: true })
      .eq("hospital_id", hospital.id);
    const mrn = `MR-${String((count ?? 0) + 1).padStart(5, "0")}`;

    const allergiesArr = data.allergies
      ? data.allergies.split(",").map((a) => a.trim()).filter(Boolean) : [];

    const { data: created, error } = await supabase.from("patients").insert({
      hospital_id: hospital.id,
      mrn,
      first_name: data.first_name,
      last_name: data.last_name,
      father_name: data.father_name || null,
      gender: data.gender,
      sex: data.sex || data.gender,
      weight_kg: data.weight_kg ? Number(data.weight_kg) : null,
      dob: data.dob || null,
      phone: data.phone || null,
      email: data.email || null,
      blood_group: data.blood_group || null,
      allergies: allergiesArr,
      address: data.address || null,
      cnic: data.cnic || null,
      assigned_doctor_id: data.assigned_doctor_id || null,
    }).select().single();
    if (error) throw new Error(error.message);

    // If a doctor was assigned, auto-create an appointment for today and notify the doctor.
    if (data.assigned_doctor_id) {
      const { data: doc } = await supabaseAdmin
        .from("profiles")
        .select("user_id, consultation_fee")
        .eq("user_id", data.assigned_doctor_id)
        .maybeSingle();
      const scheduledAt = new Date().toISOString();
      const { data: appt } = await supabase.from("appointments").insert({
        hospital_id: hospital.id,
        patient_id: created.id,
        doctor_id: data.assigned_doctor_id,
        scheduled_at: scheduledAt,
        slot_start: scheduledAt,
        status: "scheduled",
        type: "consultation",
        consultation_fee: doc?.consultation_fee ?? 0,
      }).select().single();
      if (doc?.user_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: doc.user_id,
          hospital_id: hospital.id,
          type: "appointment_assigned",
          title: "New patient assigned",
          body: `${created.first_name} ${created.last_name} has been assigned to you.`,
          data: { patient_id: created.id, appointment_id: appt?.id },
        });
      }
    }
    return { patient: created };
  });

export const deletePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("hospital_id")
      .eq("id", data.id)
      .maybeSingle();
    if (patientError) throw new Error(patientError.message);
    if (!patient) throw new Error("Patient not found");
    if (!(await canWritePatients(context.userId, patient.hospital_id))) {
      throw new Error("View-only access: this role cannot delete patients.");
    }
    const { error } = await context.supabase.from("patients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Patient detail with full visit + prescription history (any hospital staff). */
export const getPatientDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: patient, error } = await supabase
      .from("patients")
      .select("*")
      .eq("id", data.patientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!patient) throw new Error("Patient not found");

    const [{ data: appts }, { data: rx }, { data: labs }, { data: vitals }, { data: pays }, { data: admns }, { data: fups }] = await Promise.all([
      supabaseAdmin.from("appointments")
        .select("id, scheduled_at, status, payment_status, reason, notes, consultation_fee, doctor_id, type")
        .eq("patient_id", patient.id).order("scheduled_at", { ascending: false }).limit(50),
      supabaseAdmin.from("prescriptions")
        .select("id, issued_at, diagnosis, medications, notes, doctor_id")
        .eq("patient_id", patient.id).order("issued_at", { ascending: false }).limit(50),
      supabaseAdmin.from("lab_orders")
        .select("id, tests, status, priority, created_at, completed_at, department")
        .eq("patient_id", patient.id).order("created_at", { ascending: false }).limit(30),
      supabaseAdmin.from("vitals")
        .select("*").eq("patient_id", patient.id).order("recorded_at", { ascending: false }).limit(20),
      supabaseAdmin.from("payments")
        .select("id, amount, method, status, receipt_no, created_at")
        .eq("patient_id", patient.id).order("created_at", { ascending: false }).limit(30),
      supabaseAdmin.from("admissions")
        .select("id, admitted_at, discharged_at, diagnosis, discharge_summary, doctor_id, bed_id")
        .eq("patient_id", patient.id).order("admitted_at", { ascending: false }).limit(20),
      supabaseAdmin.from("follow_ups")
        .select("id, due_date, notes, doctor_id, appointment_id, reminder_sent_at, created_at")
        .eq("patient_id", patient.id).order("due_date", { ascending: false }).limit(30),
    ]);

    // Attach lab results for each order
    const labIds = (labs ?? []).map((l: any) => l.id);
    const { data: labResults } = labIds.length
      ? await supabaseAdmin.from("lab_results")
          .select("id, lab_order_id, test_name, value, unit, reference_range, flag")
          .in("lab_order_id", labIds)
      : { data: [] as any[] };
    const resByOrder: Record<string, any[]> = {};
    for (const r of labResults ?? []) (resByOrder[r.lab_order_id] = resByOrder[r.lab_order_id] || []).push(r);

    const doctorIds = Array.from(new Set([
      ...((appts ?? []).map((a: any) => a.doctor_id).filter(Boolean)),
      ...((rx ?? []).map((r: any) => r.doctor_id).filter(Boolean)),
      ...((fups ?? []).map((f: any) => f.doctor_id).filter(Boolean)),
    ]));
    let doctorMap: Record<string, any> = {};
    if (doctorIds.length) {
      const { data: docs } = await supabaseAdmin
        .from("profiles").select("user_id, display_name, specialization").in("user_id", doctorIds);
      for (const d of docs ?? []) doctorMap[d.user_id] = d;
    }
    return {
      patient,
      appointments: (appts ?? []).map((a: any) => ({ ...a, doctor: a.doctor_id ? doctorMap[a.doctor_id] ?? null : null })),
      prescriptions: (rx ?? []).map((r: any) => ({ ...r, doctor: r.doctor_id ? doctorMap[r.doctor_id] ?? null : null })),
      labOrders: (labs ?? []).map((l: any) => ({ ...l, results: resByOrder[l.id] ?? [] })),
      vitals: vitals ?? [],
      payments: pays ?? [],
      admissions: admns ?? [],
      followUps: (fups ?? []).map((f: any) => ({ ...f, doctor: f.doctor_id ? doctorMap[f.doctor_id] ?? null : null })),
      visitCount: (appts ?? []).length,
    };
  });

/** Doctor: fetch own header info (doctor profile + hospital) for prescription form. */
export const getMyDoctorContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => hospitalSlug.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: hospital } = await supabaseAdmin
      .from("hospitals").select("id, name, address, city, phone, logo_url").eq("slug", data.slug).maybeSingle();
    if (!hospital) throw new Error("Hospital not found");
    const { data: doctor } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, email, phone, specialization, department, license_no, consultation_fee")
      .eq("user_id", userId).maybeSingle();
    return { doctor, hospital };
  });

/** Doctor: create a standalone prescription for a patient (no appointment required). */
export const createPatientPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      patientId: z.string().uuid(),
      diagnosis: z.string().max(2000).optional(),
      notes: z.string().max(4000).optional(),
      next_checkup_date: z.string().optional().nullable(),
      medications: z.array(z.object({
        name: z.string().min(1).max(200),
        dose: z.string().max(100).optional(),
        frequency: z.string().max(100).optional(),
        duration: z.string().max(100).optional(),
        instructions: z.string().max(500).optional(),
      })).min(1).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: patient, error: pErr } = await supabaseAdmin
      .from("patients").select("id, hospital_id, user_id, first_name, last_name, mrn, cnic")
      .eq("id", data.patientId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!patient) throw new Error("Patient not found");

    // Verify caller is a doctor in this hospital
    const { data: docRole } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId)
      .eq("hospital_id", patient.hospital_id).eq("role", "doctor").maybeSingle();
    if (!docRole) throw new Error("Only doctors at this hospital can prescribe.");

    const { data: rx, error } = await supabaseAdmin.from("prescriptions").insert({
      hospital_id: patient.hospital_id,
      patient_id: patient.id,
      doctor_id: userId,
      diagnosis: data.diagnosis ?? null,
      notes: data.notes ?? null,
      medications: data.medications,
    }).select("id, issued_at, diagnosis, notes, medications").single();
    if (error) throw new Error(error.message);

    if (data.next_checkup_date) {
      await supabaseAdmin.from("follow_ups").insert({
        hospital_id: patient.hospital_id,
        patient_id: patient.id,
        doctor_id: userId,
        due_date: data.next_checkup_date,
        notes: data.diagnosis ?? null,
      });
    }

    // Notify patient (if linked) and hospital pharmacists
    const patientName = `${patient.first_name} ${patient.last_name}`;
    const notifs: any[] = [];
    if (patient.user_id) {
      notifs.push({
        user_id: patient.user_id, hospital_id: patient.hospital_id,
        type: "prescription.new", title: "New prescription issued",
        body: "Your doctor has issued a new prescription. Open your dashboard to view or download.",
        data: { prescription_id: rx.id },
      });
    }
    const { data: pharms } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("hospital_id", patient.hospital_id).eq("role", "pharmacist");
    for (const ph of pharms ?? []) {
      notifs.push({
        user_id: ph.user_id, hospital_id: patient.hospital_id,
        type: "prescription.new", title: "New prescription to dispense",
        body: `${patientName} (${patient.mrn}) — please prepare medications.`,
        data: { prescription_id: rx.id, patient_id: patient.id },
      });
    }
    if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);

    return { prescription: rx, patient };
  });
