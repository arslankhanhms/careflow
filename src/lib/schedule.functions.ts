import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Get the current doctor's profile (own row). */
export const getMySchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, specialization, department, consultation_fee, experience_years, working_days, working_hours, slot_duration_min, max_patients_per_day, is_doctor, hospital_id, bio, photo_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const dayEnum = z.enum(["sun","mon","tue","wed","thu","fri","sat"]);

/** Update the current doctor's schedule (also turns is_doctor=true). */
export const updateMySchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      specialization: z.string().max(120).optional(),
      department: z.string().max(120).optional(),
      bio: z.string().max(2000).optional(),
      consultation_fee: z.number().min(0).max(1_000_000).optional(),
      experience_years: z.number().int().min(0).max(80).optional(),
      working_days: z.array(dayEnum).min(1).max(7),
      working_hours: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }),
      slot_duration_min: z.number().int().min(5).max(120),
      max_patients_per_day: z.number().int().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ...data, is_doctor: true })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Today's queue for the current doctor. */
export const getMyTodayQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select("id, queue_no, slot_start, slot_end, status, payment_status, consultation_fee, reason, patient:patients(id, first_name, last_name, mrn, pmr_no, phone)")
      .eq("doctor_id", userId)
      .gte("slot_start", start.toISOString())
      .lt("slot_start", end.toISOString())
      .neq("status", "cancelled")
      .order("queue_no", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Record a manual payment (cash/easypaisa/jazzcash/bank) and mark appointment paid. */
export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      appointmentId: z.string().uuid(),
      amount: z.number().min(0).max(10_000_000),
      method: z.enum(["cash","jazzcash","easypaisa","bank","card"]),
      txnId: z.string().max(100).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: appt, error: aErr } = await supabaseAdmin
      .from("appointments")
      .select("id, hospital_id, patient_id")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!appt) throw new Error("Appointment not found");

    // If a pending payment row already exists for this appointment (created at booking),
    // UPDATE it to completed/paid instead of inserting a duplicate row.
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id, receipt_no")
      .eq("appointment_id", appt.id)
      .in("status", ["pending", "unpaid"] as any)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const receiptNo = existing?.receipt_no || ("RCP-" + new Date().getFullYear() + "-" + Math.floor(100000 + Math.random() * 899999));
    let pay: { id: string; receipt_no: string | null };
    if (existing) {
      const { data: upd, error: uErr } = await supabaseAdmin
        .from("payments")
        .update({
          amount: data.amount,
          method: data.method,
          status: "paid",
          txn_id: data.txnId || null,
          receipt_no: receiptNo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, receipt_no").single();
      if (uErr) throw new Error(uErr.message);
      pay = upd;
    } else {
      const { data: ins, error: pErr } = await supabaseAdmin
        .from("payments").insert({
          hospital_id: appt.hospital_id,
          patient_id: appt.patient_id,
          appointment_id: appt.id,
          amount: data.amount,
          method: data.method,
          status: "paid",
          txn_id: data.txnId || null,
          receipt_no: receiptNo,
        }).select("id, receipt_no").single();
      if (pErr) throw new Error(pErr.message);
      pay = ins;
    }

    await supabaseAdmin.from("appointments")
      .update({ payment_status: "paid" })
      .eq("id", appt.id);

    return { paymentId: pay.id, receiptNo: pay.receipt_no };
  });

/** Receipt details for PDF generation (patient-owned). */
export const getReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: pay, error } = await supabaseAdmin
      .from("payments")
      .select("id, amount, method, status, txn_id, receipt_no, reference_no, created_at, hospital_id, patient_id, appointment_id")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pay) throw new Error("Receipt not found");
    const { data: pat } = await supabaseAdmin
      .from("patients").select("id, first_name, last_name, mrn, pmr_no, user_id, father_name, cnic, sex, gender, dob, phone, hospital_id")
      .eq("id", pay.patient_id).maybeSingle();
    if (!pat) throw new Error("Receipt not found");
    // Allow either the patient themselves OR staff belonging to the hospital
    const isPatient = pat.user_id === userId;
    let isStaff = false;
    if (!isPatient) {
      const { data: belongs } = await supabaseAdmin.rpc("user_belongs_to_hospital", { _user_id: userId, _hospital_id: pat.hospital_id });
      isStaff = belongs === true;
    }
    if (!isPatient && !isStaff) throw new Error("Not authorized for this receipt");
    const { data: hosp } = await supabaseAdmin
      .from("hospitals").select("name, address, phone, city, country, email, logo_url, brand_color").eq("id", pay.hospital_id).maybeSingle();
    let appt: any = null;
    if (pay.appointment_id) {
      const { data: a } = await supabaseAdmin
        .from("appointments").select("scheduled_at, doctor_id, reason, consultation_fee").eq("id", pay.appointment_id).maybeSingle();
      if (a?.doctor_id) {
        const { data: doc } = await supabaseAdmin
          .from("profiles").select("display_name, specialization").eq("user_id", a.doctor_id).maybeSingle();
        appt = { ...a, doctor: doc };
      } else appt = a;
    }
    return { payment: pay, patient: pat, hospital: hosp, appointment: appt };
  });

/** Doctor: list own appointments for a given date (YYYY-MM-DD). */
export const getDoctorAppointmentsByDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const start = new Date(data.date + "T00:00:00");
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const { data: rows, error } = await supabaseAdmin
      .from("appointments")
      .select("id, queue_no, slot_start, slot_end, scheduled_at, status, payment_status, consultation_fee, concession_amount, concession_percent, concession_reason, reason, consultation_started_at, consultation_ended_at, patient:patients(id, first_name, last_name, mrn, pmr_no, cnic, phone, dob, gender)")
      .eq("doctor_id", userId)
      // Only show appointments after fee is paid (receptionist gating)
      .eq("payment_status", "paid")
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", end.toISOString())
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const startConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ appointment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: row, error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "in_progress", consultation_started_at: new Date().toISOString() })
      .eq("id", data.appointment_id)
      .eq("doctor_id", userId)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const endConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ appointment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: row, error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "completed", consultation_ended_at: new Date().toISOString() })
      .eq("id", data.appointment_id)
      .eq("doctor_id", userId)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

/** Doctor: search patients by MRN / PMR / CNIC / phone / name within own past appointments (3-month window). */
export const searchDoctorPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const since = new Date(); since.setMonth(since.getMonth() - 3);
    // Get patient_ids the doctor has seen recently
    const { data: appts, error: aErr } = await supabaseAdmin
      .from("appointments").select("patient_id")
      .eq("doctor_id", userId)
      .gte("scheduled_at", since.toISOString());
    if (aErr) throw new Error(aErr.message);
    const ids = Array.from(new Set((appts ?? []).map((a) => a.patient_id))).filter(Boolean);
    if (ids.length === 0) return [];
    const q = `%${data.query.trim()}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("patients")
      .select("id, first_name, last_name, mrn, pmr_no, cnic, phone, dob, gender")
      .in("id", ids)
      .or(`mrn.ilike.${q},pmr_no.ilike.${q},cnic.ilike.${q},phone.ilike.${q},first_name.ilike.${q},last_name.ilike.${q}`)
      .limit(25);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Doctor: full visit history for a patient with this doctor (last 3 months), with prescriptions. */
export const getPatientVisitHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const since = new Date(); since.setMonth(since.getMonth() - 3);
    const { data: patient, error: pErr } = await supabaseAdmin
      .from("patients")
      .select("id, first_name, last_name, father_name, mrn, pmr_no, cnic, phone, email, address, dob, gender, blood_group, allergies, chronic_conditions, weight_kg, emergency_contact_name, emergency_contact_phone, insurance_provider, insurance_number, default_concession_percent")
      .eq("id", data.patientId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!patient) throw new Error("Patient not found");

    const { data: appts, error: aErr } = await supabaseAdmin
      .from("appointments")
      .select("id, scheduled_at, slot_start, status, reason, notes, payment_status, consultation_fee")
      .eq("doctor_id", userId)
      .eq("patient_id", data.patientId)
      .gte("scheduled_at", since.toISOString())
      .order("scheduled_at", { ascending: false });
    if (aErr) throw new Error(aErr.message);

    const apptIds = (appts ?? []).map((a) => a.id);
    let rxByAppt: Record<string, any[]> = {};
    if (apptIds.length) {
      const { data: rxs } = await supabaseAdmin
        .from("prescriptions")
        .select("id, appointment_id, issued_at, diagnosis, medications, notes, ai_assisted, vitals, symptoms, examination, allergies_drug, allergies_food, chronic_conditions, lab_tests, suggested_treatment, follow_up_notes, follow_up_date")
        .in("appointment_id", apptIds)
        .order("issued_at", { ascending: false });
      for (const r of rxs ?? []) {
        const k = r.appointment_id as string;
        rxByAppt[k] = rxByAppt[k] || [];
        rxByAppt[k].push(r);
      }
    }

    // Lab orders ordered by this doctor for this patient
    const { data: labs } = await supabaseAdmin
      .from("lab_orders")
      .select("id, tests, status, priority, created_at, completed_at, notes")
      .eq("patient_id", data.patientId)
      .eq("ordered_by", userId)
      .order("created_at", { ascending: false }).limit(50);

    const labIds = (labs ?? []).map((l) => l.id);
    const { data: labResults } = labIds.length
      ? await supabaseAdmin.from("lab_results")
          .select("id, lab_order_id, test_name, value, unit, reference_range, flag")
          .in("lab_order_id", labIds)
      : { data: [] as any[] };
    const resByOrder: Record<string, any[]> = {};
    for (const r of labResults ?? []) (resByOrder[r.lab_order_id] = resByOrder[r.lab_order_id] || []).push(r);

    // Follow-ups for this patient with this doctor
    const { data: followUps } = await supabaseAdmin
      .from("follow_ups")
      .select("id, due_date, notes, appointment_id, created_at")
      .eq("patient_id", data.patientId)
      .eq("doctor_id", userId)
      .order("due_date", { ascending: false }).limit(50);

    // Aggregate disease history from all prescriptions (any doctor) so the doctor sees the full picture
    const { data: allRx } = await supabaseAdmin
      .from("prescriptions")
      .select("diagnosis")
      .eq("patient_id", data.patientId);
    const diseases = Array.from(new Set(
      (allRx ?? []).map((r: any) => (r.diagnosis || "").trim()).filter(Boolean)
    ));

    return {
      patient,
      visits: (appts ?? []).map((a) => ({ ...a, prescriptions: rxByAppt[a.id] ?? [] })),
      labs: (labs ?? []).map((l) => ({ ...l, results: resByOrder[l.id] ?? [] })),
      followUps: followUps ?? [],
      diseases,
    };
  });


/** Doctor: save/upsert prescription tied to an appointment. */
export const saveDoctorPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      appointmentId: z.string().uuid(),
      /** When provided, EDIT the existing prescription instead of inserting a new one. */
      prescriptionId: z.string().uuid().optional(),
      diagnosis: z.string().max(2000).optional(),
      notes: z.string().max(4000).optional(),
      symptoms: z.array(z.string().max(120)).max(50).optional(),
      examination: z.string().max(4000).optional(),
      allergies_drug: z.array(z.string().max(120)).max(50).optional(),
      allergies_food: z.array(z.string().max(120)).max(50).optional(),
      chronic_conditions: z.array(z.string().max(120)).max(50).optional(),
      lab_tests: z.array(z.string().max(200)).max(50).optional(),
      lab_priority: z.enum(["routine", "urgent", "stat"]).optional(),
      lab_notes: z.string().max(1000).optional(),
      suggested_treatment: z.string().max(4000).optional(),
      follow_up_notes: z.string().max(1000).optional(),
      vitals: z.object({
        bp: z.string().max(40).optional(),
        temperature: z.string().max(20).optional(),
        sugar: z.string().max(40).optional(),
        pulse: z.string().max(20).optional(),
        weight: z.string().max(20).optional(),
        height: z.string().max(20).optional(),
        spo2: z.string().max(20).optional(),
        respiratory_rate: z.string().max(20).optional(),
      }).partial().optional(),
      medications: z.array(z.object({
        name: z.string().min(1).max(200),
        dose: z.string().max(100).optional(),
        frequency: z.string().max(100).optional(),
        duration: z.string().max(100).optional(),
        instructions: z.string().max(500).optional(),
      })).max(50),
      next_checkup_date: z.string().max(40).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: appt, error: aErr } = await supabaseAdmin
      .from("appointments").select("id, hospital_id, patient_id, doctor_id")
      .eq("id", data.appointmentId).maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!appt) throw new Error("Appointment not found");
    if (appt.doctor_id !== userId) throw new Error("Not your appointment");

    const payload: any = {
      hospital_id: appt.hospital_id,
      patient_id: appt.patient_id,
      doctor_id: userId,
      appointment_id: appt.id,
      diagnosis: data.diagnosis ?? null,
      notes: data.notes ?? null,
      medications: data.medications,
      vitals: (data.vitals ?? null) as any,
      symptoms: data.symptoms ?? [],
      examination: data.examination ?? null,
      allergies_drug: data.allergies_drug ?? [],
      allergies_food: data.allergies_food ?? [],
      chronic_conditions: data.chronic_conditions ?? [],
      lab_tests: data.lab_tests ?? [],
      suggested_treatment: data.suggested_treatment ?? null,
      follow_up_notes: data.follow_up_notes ?? null,
      follow_up_date: data.next_checkup_date || null,
    };

    let rxId: string;
    let updated = false;
    if (data.prescriptionId) {
      const { data: upd, error: uErr } = await supabaseAdmin
        .from("prescriptions").update(payload).eq("id", data.prescriptionId).select("id").single();
      if (uErr) throw new Error(uErr.message);
      rxId = upd.id; updated = true;
    } else {
      const { data: ins, error: insErr } = await supabaseAdmin
        .from("prescriptions").insert(payload).select("id").single();
      if (insErr) throw new Error(insErr.message);
      rxId = ins.id;
    }

    // Auto-mark the appointment as completed once the doctor saves a prescription
    await supabaseAdmin.from("appointments")
      .update({ status: "completed" }).eq("id", appt.id);

    // Schedule next checkup (follow-up) when the doctor sets a date
    if (data.next_checkup_date && !updated) {
      await supabaseAdmin.from("follow_ups").insert({
        hospital_id: appt.hospital_id,
        patient_id: appt.patient_id,
        doctor_id: userId,
        due_date: data.next_checkup_date,
        notes: data.diagnosis ?? null,
      });
    }

    // Notify patient + hospital pharmacists on every save (new or update)
    {
      const { data: pat } = await supabaseAdmin
        .from("patients").select("user_id, first_name, last_name, mrn, cnic").eq("id", appt.patient_id).maybeSingle();
      const patientName = pat ? `${pat.first_name} ${pat.last_name}` : "Patient";
      const notifs: any[] = [];
      const isUpdate = updated;
      if (pat?.user_id) {
        notifs.push({
          user_id: pat.user_id, hospital_id: appt.hospital_id,
          type: isUpdate ? "prescription.updated" : "prescription.new",
          title: isUpdate ? "Prescription updated" : "New prescription issued",
          body: isUpdate
            ? "Your doctor has updated your prescription. Please review the latest version."
            : "Your doctor has issued a new prescription.",
          data: { prescription_id: rxId, appointment_id: appt.id, updated: isUpdate },
        });
      }
      const { data: pharms } = await supabaseAdmin
        .from("user_roles").select("user_id").eq("hospital_id", appt.hospital_id).eq("role", "pharmacist");
      for (const ph of pharms ?? []) {
        notifs.push({
          user_id: ph.user_id, hospital_id: appt.hospital_id,
          type: isUpdate ? "prescription.updated" : "prescription.new",
          title: isUpdate ? "Prescription updated — please review" : "New prescription to dispense",
          body: isUpdate
            ? `${patientName}${pat?.mrn ? ` (MRN ${pat.mrn})` : ""} — doctor updated the prescription. Replace the previous version.`
            : `${patientName}${pat?.mrn ? ` (MRN ${pat.mrn})` : ""} — please prepare medications.`,
          data: { prescription_id: rxId, patient_id: appt.patient_id, mrn: pat?.mrn, cnic: pat?.cnic, updated: isUpdate },
        });
      }

      // Auto-create a lab order when lab tests are advised (new only).
      // Lab order goes to RECEPTIONIST first for fee collection — lab techs are
      // notified later by recordLabPayment after the patient pays.
      if (!isUpdate && (data.lab_tests ?? []).length > 0) {
        const { data: svc } = await supabaseAdmin
          .from("hospital_lab_services")
          .select("name, price, urgent_default")
          .eq("hospital_id", appt.hospital_id);
        const byName = new Map<string, any>();
        for (const s of svc ?? []) byName.set((s.name as string).toLowerCase(), s);
        let total = 0;
        let svcUrgent = false;
        for (const t of data.lab_tests!) {
          const m = byName.get(t.toLowerCase());
          if (m) { total += Number(m.price ?? 0); if (m.urgent_default) svcUrgent = true; }
        }
        const priority = data.lab_priority ?? (svcUrgent ? "urgent" : "routine");
        const { data: order } = await supabaseAdmin.from("lab_orders").insert({
          hospital_id: appt.hospital_id,
          patient_id: appt.patient_id,
          ordered_by: userId,
          referring_doctor_id: userId,
          tests: data.lab_tests as string[],
          priority,
          notes: data.lab_notes ?? data.diagnosis ?? null,
          total_amount: total,
        }).select("id").maybeSingle();

        // Notify ONLY receptionists / accountants / admins — not lab techs yet.
        const { data: billStaff } = await supabaseAdmin
          .from("user_roles").select("user_id")
          .eq("hospital_id", appt.hospital_id)
          .in("role", ["receptionist", "accountant", "hospital_admin", "owner"]);
        const urgentTag = priority === "urgent" || priority === "stat" ? "🚨 URGENT — " : "";
        for (const r of billStaff ?? []) {
          notifs.push({
            user_id: r.user_id, hospital_id: appt.hospital_id,
            type: "lab.awaiting_payment",
            title: `${urgentTag}Lab bill — collect payment`,
            body: `${patientName}${pat?.mrn ? ` (MRN ${pat.mrn})` : ""} — ${data.lab_tests!.join(", ")} (Rs ${total.toLocaleString()})`,
            data: { order_id: order?.id, patient_id: appt.patient_id, priority, mrn: pat?.mrn },
          });
        }
      }

      if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);
    }

    return { id: rxId, updated };
  });


/** Doctor: get hospital + doctor + patient context for a prescription PDF. */
export const getPrescriptionContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ appointmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: appt, error } = await supabaseAdmin
      .from("appointments")
      .select("id, scheduled_at, slot_start, reason, hospital_id, patient_id, doctor_id")
      .eq("id", data.appointmentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!appt) throw new Error("Appointment not found");
    if (appt.doctor_id !== userId) throw new Error("Not your appointment");

    const [{ data: hospital }, { data: doctor }, { data: patient }, { data: nextFollowUp }] = await Promise.all([
      supabaseAdmin.from("hospitals")
        .select("name, address, city, country, phone, email, logo_url, brand_color, phc_registration_no, hospital_registration_no")
        .eq("id", appt.hospital_id).maybeSingle(),
      supabaseAdmin.from("profiles")
        .select("display_name, specialization, department, experience_years, bio, phone, email, license_no, signature_url, stamp_url")
        .eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("patients")
        .select("id, first_name, last_name, mrn, pmr_no, cnic, phone, dob, gender, blood_group, allergies, chronic_conditions, address")
        .eq("id", appt.patient_id).maybeSingle(),
      supabaseAdmin.from("follow_ups")
        .select("id, due_date, notes")
        .eq("patient_id", appt.patient_id)
        .gte("due_date", new Date().toISOString().slice(0, 10))
        .order("due_date", { ascending: true }).limit(1).maybeSingle(),
    ]);
    return { appointment: appt, hospital, doctor, patient, nextFollowUp };
  });



