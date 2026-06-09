import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyPatientByChannels } from "@/integrations/twilio.server";

async function getHospitalId(supabase: any, slug: string) {
  const { data, error } = await supabase.from("hospitals").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hospital not found");
  return data.id as string;
}

export const listLabOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const { data: rows, error } = await supabase
      .from("lab_orders")
      .select("*, patient:patients(id,first_name,last_name,mrn)")
      .eq("hospital_id", hid)
      // Lab only sees orders that have been paid for at reception.
      .neq("payment_status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    // Attach doctor display names + results count
    const orderIds = (rows ?? []).map((r: any) => r.id);
    const docIds = Array.from(new Set((rows ?? []).map((r: any) => r.ordered_by).filter(Boolean)));
    let docMap: Record<string, any> = {};
    if (docIds.length) {
      const { data: docs } = await supabaseAdmin
        .from("profiles").select("user_id, display_name, specialization").in("user_id", docIds);
      for (const d of docs ?? []) docMap[d.user_id] = d;
    }
    let resultsCount: Record<string, number> = {};
    if (orderIds.length) {
      const { data: rs } = await supabaseAdmin
        .from("lab_results").select("lab_order_id").in("lab_order_id", orderIds);
      for (const r of rs ?? []) resultsCount[r.lab_order_id] = (resultsCount[r.lab_order_id] ?? 0) + 1;
    }
    return {
      orders: (rows ?? []).map((r: any) => ({
        ...r,
        doctor: r.ordered_by ? docMap[r.ordered_by] ?? null : null,
        results_count: resultsCount[r.id] ?? 0,
      })),
    };
  });

export const createLabOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      patient_id: z.string().uuid(),
      tests: z.array(z.string().min(1).max(120)).min(1).max(40),
      priority: z.enum(["routine", "urgent", "stat"]).default("routine"),
      notes: z.string().max(500).optional(),
      referring_doctor_id: z.string().uuid().optional().nullable(),
      doctor_commission_percent: z.number().min(0).max(100).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);

    // Compute total from hospital_lab_services prices
    let total_amount = 0;
    const { data: svcs } = await supabase
      .from("hospital_lab_services").select("name, price")
      .eq("hospital_id", hid).in("name", data.tests);
    for (const t of data.tests) {
      const row = (svcs ?? []).find((s: any) => s.name === t);
      total_amount += Number(row?.price ?? 0);
    }

    // Resolve commission %: explicit -> doctor-specific rule -> hospital default rule
    let commission = data.doctor_commission_percent;
    if ((commission == null) && data.referring_doctor_id) {
      const { data: rules } = await supabase
        .from("doctor_commission_rules")
        .select("doctor_id, percent")
        .eq("hospital_id", hid).eq("type", "lab").eq("active", true);
      const specific = (rules ?? []).find((r: any) => r.doctor_id === data.referring_doctor_id);
      const fallback = (rules ?? []).find((r: any) => !r.doctor_id);
      commission = Number(specific?.percent ?? fallback?.percent ?? 0);
    }

    const { data: row, error } = await supabase.from("lab_orders").insert({
      hospital_id: hid,
      patient_id: data.patient_id,
      tests: data.tests,
      priority: data.priority,
      notes: data.notes ?? null,
      referring_doctor_id: data.referring_doctor_id ?? null,
      doctor_commission_percent: Number(commission ?? 0),
      total_amount,
    }).select().single();
    if (error) throw new Error(error.message);
    return { order: row };
  });

export const updateLabOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["ordered", "sample_collected", "processing", "completed", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch = data.status === "completed"
      ? { status: data.status, completed_at: new Date().toISOString() }
      : { status: data.status };
    const { error } = await context.supabase.from("lab_orders").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Doctor: create a lab order from their own dashboard. */
export const createDoctorLabOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      patient_id: z.string().uuid(),
      tests: z.array(z.string().min(1).max(120)).min(1).max(40),
      priority: z.enum(["routine", "urgent", "stat"]).default("routine"),
      department: z.string().max(60).optional(),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles").select("hospital_id, display_name").eq("user_id", userId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof?.hospital_id) throw new Error("Your profile is not linked to a hospital");

    const { data: pat } = await supabaseAdmin
      .from("patients").select("id, hospital_id, first_name, last_name, user_id")
      .eq("id", data.patient_id).maybeSingle();
    if (!pat || pat.hospital_id !== prof.hospital_id) throw new Error("Patient not in your hospital");

    // Compute total + commission % for the ordering doctor (they are the referrer)
    let total_amount = 0;
    const { data: svcs } = await supabaseAdmin
      .from("hospital_lab_services").select("name, price")
      .eq("hospital_id", prof.hospital_id).in("name", data.tests);
    for (const t of data.tests) {
      total_amount += Number((svcs ?? []).find((s: any) => s.name === t)?.price ?? 0);
    }
    const { data: rules } = await supabaseAdmin
      .from("doctor_commission_rules")
      .select("doctor_id, percent")
      .eq("hospital_id", prof.hospital_id).eq("type", "lab").eq("active", true);
    const specific = (rules ?? []).find((r: any) => r.doctor_id === userId);
    const fallback = (rules ?? []).find((r: any) => !r.doctor_id);
    const commission_percent = Number(specific?.percent ?? fallback?.percent ?? 0);

    const { data: row, error } = await supabaseAdmin.from("lab_orders").insert({
      hospital_id: prof.hospital_id,
      patient_id: data.patient_id,
      ordered_by: userId,
      referring_doctor_id: userId,
      tests: data.tests,
      priority: data.priority,
      department: data.department ?? null,
      notes: data.notes ?? null,
      doctor_commission_percent: commission_percent,
      total_amount,
    }).select().single();
    if (error) throw new Error(error.message);

    // Notify all lab techs (and hospital admins) about the new order
    const { data: labStaff } = await supabaseAdmin
      .from("user_roles").select("user_id")
      .eq("hospital_id", prof.hospital_id)
      .in("role", ["lab_tech", "hospital_admin"]);
    const urgentTag = data.priority === "urgent" || data.priority === "stat" ? "🚨 URGENT — " : "";
    const notifs = (labStaff ?? []).map((r: any) => ({
      user_id: r.user_id, hospital_id: prof.hospital_id,
      type: "lab.new_order",
      title: `${urgentTag}New lab order${data.department ? ` (${data.department})` : ""}`,
      body: `${pat.first_name} ${pat.last_name} — ${data.tests.join(", ")}`,
      data: { order_id: row.id, patient_id: data.patient_id, priority: data.priority },
    }));
    if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);

    return { order: row };
  });

/** Doctor: list lab orders they ordered, with results when available. */
export const listMyDoctorLabOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: orders, error } = await supabaseAdmin
      .from("lab_orders")
      .select("id, tests, status, priority, notes, created_at, completed_at, patient:patients(id, first_name, last_name, mrn, pmr_no)")
      .eq("ordered_by", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = (orders ?? []).map((o: any) => o.id);
    let resultsByOrder: Record<string, any[]> = {};
    if (ids.length) {
      const { data: results } = await supabaseAdmin
        .from("lab_results")
        .select("id, lab_order_id, test_name, value, unit, reference_range, flag, ai_interpretation, created_at")
        .in("lab_order_id", ids);
      for (const r of results ?? []) {
        const k = r.lab_order_id as string;
        resultsByOrder[k] = resultsByOrder[k] || [];
        resultsByOrder[k].push(r);
      }
    }
    return (orders ?? []).map((o: any) => ({ ...o, results: resultsByOrder[o.id] ?? [] }));
  });

/** Lab staff: submit results for an order. Marks the order completed and notifies the ordering doctor + patient (if linked). */
export const submitLabResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      results: z.array(z.object({
        test_name: z.string().min(1).max(120),
        value: z.string().max(200).optional(),
        unit: z.string().max(40).optional(),
        reference_range: z.string().max(100).optional(),
        flag: z.string().max(20).optional(),
      })).min(1).max(40),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: order, error: oErr } = await supabaseAdmin
      .from("lab_orders").select("id, hospital_id, patient_id, ordered_by")
      .eq("id", data.orderId).maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Lab order not found");

    const rows = data.results.map((r) => ({
      lab_order_id: order.id,
      hospital_id: order.hospital_id,
      test_name: r.test_name,
      value: r.value ?? null,
      unit: r.unit ?? null,
      reference_range: r.reference_range ?? null,
      flag: r.flag ?? null,
    }));
    const { error: rErr } = await supabaseAdmin.from("lab_results").insert(rows);
    if (rErr) throw new Error(rErr.message);

    await supabaseAdmin.from("lab_orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", order.id);

    // Build notification recipients
    const { data: pat } = await supabaseAdmin
      .from("patients").select("first_name, last_name, user_id, phone").eq("id", order.patient_id).maybeSingle();
    const patientName = pat ? `${pat.first_name} ${pat.last_name}` : "Patient";
    const notifs: any[] = [];
    if (order.ordered_by) {
      notifs.push({
        user_id: order.ordered_by,
        hospital_id: order.hospital_id,
        type: "lab_result",
        title: "Lab results available",
        body: `Results ready for ${patientName}.`,
        data: { order_id: order.id, patient_id: order.patient_id },
      });
    }
    if (pat?.user_id) {
      notifs.push({
        user_id: pat.user_id,
        hospital_id: order.hospital_id,
        type: "lab_result",
        title: "Your lab results are ready",
        body: "Tap to view your results.",
        data: { order_id: order.id },
      });
    }
    if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);

    // External SMS/WhatsApp to patient
    await notifyPatientByChannels({
      hospitalId: order.hospital_id,
      phone: pat?.phone,
      message: `Your lab results are ready. Please log in to your patient portal to view them.`,
    });

    return { ok: true, inserted: rows.length };
  });

/** Fetch a single lab order with results, patient, doctor, hospital name (for PDF). */
export const getLabOrderForPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order, error } = await supabase
      .from("lab_orders")
      .select("id, hospital_id, created_at, completed_at, priority, status, notes, tests, ordered_by, patient:patients(first_name,last_name,mrn,pmr_no)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");

    const { data: results } = await supabase
      .from("lab_results")
      .select("test_name, value, unit, reference_range, flag")
      .eq("lab_order_id", order.id);

    let doctor: any = null;
    if (order.ordered_by) {
      const { data: d } = await supabaseAdmin
        .from("profiles").select("display_name, specialization").eq("user_id", order.ordered_by).maybeSingle();
      doctor = d;
    }

    const { data: hosp } = await supabase
      .from("hospitals").select("name").eq("id", order.hospital_id).maybeSingle();

    return { order: { ...order, results: results ?? [], doctor }, hospitalName: hosp?.name ?? "Hospital" };
  });

/** Receptionist/Admin: list lab orders for billing (with computed amount from services catalog). */
export const listLabOrdersForBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1), filter: z.enum(["pending","paid","all"]).default("pending") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    let q = supabase
      .from("lab_orders")
      .select("id, created_at, tests, status, priority, payment_status, paid_amount, payment_method, paid_at, total_amount, patient:patients(id,first_name,last_name,mrn,phone)")
      .eq("hospital_id", hid)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.filter !== "all") q = q.eq("payment_status", data.filter);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Compute amount from hospital_lab_services for orders missing total_amount
    const { data: svcs } = await supabaseAdmin
      .from("hospital_lab_services").select("name, price").eq("hospital_id", hid);
    const priceMap: Record<string, number> = {};
    for (const s of svcs ?? []) priceMap[s.name] = Number(s.price ?? 0);

    return (rows ?? []).map((r: any) => {
      const computed = (r.tests ?? []).reduce((sum: number, t: string) => sum + (priceMap[t] ?? 0), 0);
      const storedTotal = Number(r.total_amount ?? 0);
      const paidAmount = Number(r.paid_amount ?? 0);
      const amount = r.payment_status === "paid"
        ? (paidAmount > 0 ? paidAmount : (storedTotal > 0 ? storedTotal : computed))
        : (storedTotal > 0 ? storedTotal : computed);
      return { ...r, computed_amount: computed, amount_due: amount };
    });
  });

/** Receptionist: record a payment for a lab order.
 *  Also writes a `payments` row (so it appears in the patient portal with a
 *  printable receipt like OPD) and notifies the patient, the ordering doctor,
 *  and the lab technicians. */
export const recordLabPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      amount: z.number().min(0).max(10_000_000),
      method: z.enum(["cash", "card", "online", "bank_transfer", "other"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: order, error: oErr } = await supabaseAdmin
      .from("lab_orders")
      .select("id, hospital_id, patient_id, ordered_by, referring_doctor_id, tests")
      .eq("id", data.orderId).maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Lab order not found");

    const { error } = await supabaseAdmin.from("lab_orders").update({
      payment_status: "paid",
      paid_amount: data.amount,
      payment_method: data.method,
      paid_at: new Date().toISOString(),
      received_by: userId,
      total_amount: data.amount,
    }).eq("id", data.orderId);
    if (error) throw new Error(error.message);

    const receiptNo = "LAB-" + new Date().getFullYear() + "-" +
      String(Math.floor(100000 + Math.random() * 899999));
    const { data: payRow } = await supabaseAdmin.from("payments").insert({
      hospital_id: order.hospital_id,
      patient_id: order.patient_id,
      appointment_id: null,
      amount: data.amount,
      method: data.method,
      status: "paid",
      receipt_no: receiptNo,
      updated_by: userId,
      metadata: { source: "lab", lab_order_id: order.id, tests: order.tests },
    }).select("id, receipt_no, created_at").single();

    // Receipt context (patient, hospital, doctor)
    const doctorId = (order.ordered_by || order.referring_doctor_id) as string | null;
    const [{ data: pat }, { data: hosp }, doctorRes] = await Promise.all([
      supabaseAdmin.from("patients")
        .select("first_name, last_name, mrn, cnic, phone, gender, dob, user_id")
        .eq("id", order.patient_id).maybeSingle(),
      supabaseAdmin.from("hospitals")
        .select("name, address, city, phone, email, logo_url, brand_color")
        .eq("id", order.hospital_id).maybeSingle(),
      doctorId
        ? supabaseAdmin.from("profiles").select("display_name, specialization").eq("user_id", doctorId).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    const doctor = (doctorRes as any)?.data ?? null;
    const patientName = pat ? `${pat.first_name} ${pat.last_name}` : "Patient";
    const testsStr = (order.tests ?? []).join(", ") || "lab tests";

    const notifs: any[] = [];
    if (pat?.user_id) {
      notifs.push({
        user_id: pat.user_id, hospital_id: order.hospital_id,
        type: "lab.payment_confirmed",
        title: "Lab payment confirmed",
        body: `Payment of Rs ${Number(data.amount).toLocaleString()} received for ${testsStr}. Receipt is available in your dashboard.`,
        data: { lab_order_id: order.id, payment_id: payRow?.id ?? null, receipt_no: payRow?.receipt_no ?? receiptNo },
      });
    }
    if (doctorId) {
      notifs.push({
        user_id: doctorId, hospital_id: order.hospital_id,
        type: "lab.payment_confirmed",
        title: "Lab fee paid",
        body: `${patientName} paid Rs ${Number(data.amount).toLocaleString()} for ${testsStr}.`,
        data: { lab_order_id: order.id, payment_id: payRow?.id ?? null, receipt_no: payRow?.receipt_no ?? receiptNo },
      });
    }
    const { data: labStaff } = await supabaseAdmin
      .from("user_roles").select("user_id")
      .eq("hospital_id", order.hospital_id).in("role", ["lab_tech"]);
    for (const r of labStaff ?? []) {
      notifs.push({
        user_id: r.user_id, hospital_id: order.hospital_id,
        type: "lab.payment_confirmed",
        title: "Lab payment received — start processing",
        body: `${patientName} — ${testsStr} (Rs ${Number(data.amount).toLocaleString()})`,
        data: { lab_order_id: order.id, payment_id: payRow?.id ?? null, receipt_no: payRow?.receipt_no ?? receiptNo },
      });
    }
    if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);

    return {
      ok: true,
      paymentId: payRow?.id ?? null,
      receiptNo: payRow?.receipt_no ?? receiptNo,
      receipt: {
        hospitalName: hosp?.name ?? "Hospital",
        hospitalAddress: hosp?.address ?? null,
        hospitalCity: hosp?.city ?? null,
        hospitalPhone: hosp?.phone ?? null,
        hospitalEmail: hosp?.email ?? null,
        hospitalLogoUrl: hosp?.logo_url ?? null,
        hospitalBrandColor: hosp?.brand_color ?? null,
        receiptNo: payRow?.receipt_no ?? receiptNo,
        paidAt: payRow?.created_at ?? new Date().toISOString(),
        patientName,
        patientMrn: pat?.mrn ?? null,
        patientCnic: pat?.cnic ?? null,
        patientSex: pat?.gender ?? null,
        patientPhone: pat?.phone ?? null,
        patientDob: pat?.dob ?? null,
        doctorName: doctor?.display_name ?? null,
        doctorSpecialization: doctor?.specialization ?? null,
        appointmentAt: null as string | null,
        amount: data.amount,
        method: data.method,
        status: "paid",
        txnId: `LAB-${order.id.slice(0, 8)}`,
        testsLabel: testsStr,
      },
    };
  });
