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

async function audit(
  db: any,
  args: { hospital_id: string; actor_id?: string | null; action: string; entity_type?: string; entity_id?: string | null; metadata?: any },
) {
  try {
    await db.from("audit_logs").insert({
      hospital_id: args.hospital_id,
      actor_id: args.actor_id ?? null,
      action: args.action,
      entity_type: args.entity_type ?? null,
      entity_id: args.entity_id ?? null,
      metadata: args.metadata ?? null,
    });
  } catch {
    // never fail the operation because of audit logging
  }
}

export const listPharmacyItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const { data: rows, error } = await supabase
      .from("pharmacy_items")
      .select("*")
      .eq("hospital_id", hid)
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const createPharmacyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1).max(200),
      sku: z.string().max(60).optional(),
      category: z.string().max(80).optional(),
      manufacturer: z.string().max(120).optional(),
      unit: z.string().max(40).default("tablet"),
      stock_qty: z.number().int().min(0).default(0),
      reorder_level: z.number().int().min(0).default(10),
      unit_price: z.number().min(0).default(0),
      expiry_date: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const { data: row, error } = await supabase.from("pharmacy_items").insert({
      hospital_id: hid,
      name: data.name,
      sku: data.sku ?? null,
      category: data.category ?? null,
      manufacturer: data.manufacturer ?? null,
      unit: data.unit,
      stock_qty: data.stock_qty,
      reorder_level: data.reorder_level,
      unit_price: data.unit_price,
      expiry_date: data.expiry_date || null,
    }).select().single();
    if (error) throw new Error(error.message);
    return { item: row };
  });

export const adjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), delta: z.number().int() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cur, error: e1 } = await supabase
      .from("pharmacy_items").select("stock_qty").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    const next = Math.max(0, (cur?.stock_qty ?? 0) + data.delta);
    const { error } = await supabase.from("pharmacy_items").update({ stock_qty: next }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { stock_qty: next };
  });

export const deletePharmacyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pharmacy_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pharmacy lookup: find a patient by MRN / PMR / CNIC / phone and return their recent prescriptions (last 60 days). */
export const lookupPharmacyPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ slug: z.string().min(1), query: z.string().min(2).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const q = data.query.trim();
    const pattern = `%${q}%`;
    const { data: patient, error: pErr } = await supabase
      .from("patients")
      .select("id, mrn, pmr_no, cnic, first_name, last_name, phone, blood_group, allergies, dob, gender")
      .eq("hospital_id", hid)
      .or(`mrn.eq.${q},pmr_no.eq.${q},cnic.eq.${q},phone.ilike.${pattern}`)
      .limit(1)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!patient) return { patient: null, prescriptions: [] };

    const since = new Date(); since.setDate(since.getDate() - 60);
    const { data: rx, error: rErr } = await supabase
      .from("prescriptions")
      .select("id, issued_at, diagnosis, medications, notes, doctor_id")
      .eq("hospital_id", hid)
      .eq("patient_id", patient.id)
      .gte("issued_at", since.toISOString())
      .order("issued_at", { ascending: false })
      .limit(50);
    if (rErr) throw new Error(rErr.message);
    return { patient, prescriptions: rx ?? [] };
  });

/** Pharmacy: list pending (un-dispensed) prescriptions for this hospital from the last 14 days. */
export const listPendingPrescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const since = new Date(); since.setDate(since.getDate() - 14);
    const { data: rx, error } = await supabaseAdmin
      .from("prescriptions")
      .select("id, issued_at, diagnosis, medications, notes, doctor_id, patient:patients(id,first_name,last_name,mrn,cnic,phone)")
      .eq("hospital_id", hid)
      .gte("issued_at", since.toISOString())
      .order("issued_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = (rx ?? []).map((r: any) => r.id);
    let dispensed: Record<string, any> = {};
    if (ids.length) {
      const { data: d } = await supabaseAdmin
        .from("pharmacy_dispenses").select("prescription_id, created_at, total").in("prescription_id", ids);
      for (const row of (d ?? []) as any[]) if (row.prescription_id) dispensed[row.prescription_id as string] = row;
    }
    const docIds = Array.from(new Set((rx ?? []).map((r: any) => r.doctor_id).filter(Boolean)));
    let docMap: Record<string, any> = {};
    if (docIds.length) {
      const { data: docs } = await supabaseAdmin
        .from("profiles").select("user_id, display_name, specialization").in("user_id", docIds);
      for (const d of docs ?? []) docMap[d.user_id] = d;
    }
    return {
      prescriptions: (rx ?? []).map((r: any) => ({
        ...r,
        doctor: r.doctor_id ? docMap[r.doctor_id] ?? null : null,
        dispense: dispensed[r.id] ?? null,
      })),
    };
  });

/** Pharmacy: mark a prescription as dispensed → notifies the prescribing doctor + patient. */
export const dispensePrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prescriptionId: z.string().uuid(), total: z.number().min(0).default(0) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: rx, error } = await supabaseAdmin
      .from("prescriptions").select("id, hospital_id, patient_id, doctor_id, medications")
      .eq("id", data.prescriptionId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!rx) throw new Error("Prescription not found");

    // Guard: caller must belong to the same hospital
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId).eq("hospital_id", rx.hospital_id);
    if (!roles?.length) throw new Error("Not authorized");

    const { data: existing } = await supabaseAdmin
      .from("pharmacy_dispenses").select("id").eq("prescription_id", rx.id).maybeSingle();
    if (existing) return { ok: true, alreadyDispensed: true };

    const { error: iErr } = await supabaseAdmin.from("pharmacy_dispenses").insert({
      hospital_id: rx.hospital_id,
      prescription_id: rx.id,
      patient_id: rx.patient_id,
      dispensed_by: userId,
      items: rx.medications ?? [],
      total: data.total,
    });
    if (iErr) throw new Error(iErr.message);

    const { data: pat } = await supabaseAdmin
      .from("patients").select("first_name, last_name, mrn, user_id").eq("id", rx.patient_id).maybeSingle();
    const patientName = pat ? `${pat.first_name} ${pat.last_name}` : "Patient";
    const notifs: any[] = [];
    if (rx.doctor_id) notifs.push({
      user_id: rx.doctor_id, hospital_id: rx.hospital_id,
      type: "prescription.dispensed", title: "Prescription dispensed",
      body: `Pharmacy has dispensed medication for ${patientName} (${pat?.mrn ?? ""}).`,
      data: { prescription_id: rx.id, patient_id: rx.patient_id },
    });
    if (pat?.user_id) notifs.push({
      user_id: pat.user_id, hospital_id: rx.hospital_id,
      type: "prescription.dispensed", title: "Your medication is ready",
      body: "Your prescription has been dispensed at the pharmacy.",
      data: { prescription_id: rx.id },
    });
    if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);

    await audit(supabaseAdmin, {
      hospital_id: rx.hospital_id,
      actor_id: userId,
      action: "pharmacy.dispense",
      entity_type: "prescription",
      entity_id: rx.id,
      metadata: {
        patient_id: rx.patient_id,
        doctor_id: rx.doctor_id,
        items_count: Array.isArray(rx.medications) ? rx.medications.length : 0,
        total: data.total,
      },
    });

    return { ok: true };
  });

/** Doctor-side: search the caller's hospital pharmacy by medicine name / generic / company.
 *  Used by the prescription medicine autocomplete to show only meds available in pharmacy. */
export const searchMyPharmacyMedicines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles").select("hospital_id").eq("user_id", context.userId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof?.hospital_id) return { medicines: [] as any[] };
    const pattern = `%${data.q.trim()}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("pharmacy_medicines")
      .select("id, name, generic_name, company, unit, stock_qty, sale_price")
      .eq("hospital_id", prof.hospital_id)
      .eq("active", true)
      .or(`name.ilike.${pattern},generic_name.ilike.${pattern},company.ilike.${pattern}`)
      .order("name", { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);
    return { medicines: rows ?? [] };
  });

/** =================== NEW PHARMACY MODULE (medicines / categories / dashboard) =================== */


export const listMedicines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1), search: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    let q = supabase
      .from("pharmacy_medicines")
      .select("*, category:pharmacy_categories(id,name)")
      .eq("hospital_id", hid)
      .order("name", { ascending: true })
      .limit(1000);
    if (data.search && data.search.trim()) {
      const pattern = `%${data.search.trim()}%`;
      q = q.or(`name.ilike.${pattern},generic_name.ilike.${pattern},barcode.ilike.${pattern}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { medicines: rows ?? [] };
  });

export const listCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const { data: rows, error } = await supabase
      .from("pharmacy_categories").select("*").eq("hospital_id", hid).order("name");
    if (error) throw new Error(error.message);
    return { categories: rows ?? [] };
  });

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1), name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await getHospitalId(context.supabase, data.slug);
    const { data: row, error } = await context.supabase.from("pharmacy_categories")
      .insert({ hospital_id: hid, name: data.name }).select().single();
    if (error) throw new Error(error.message);
    return { category: row };
  });

export const createMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1).max(200),
      generic_name: z.string().max(200).optional().nullable(),
      category_id: z.string().uuid().optional().nullable(),
      company: z.string().max(120).optional().nullable(),
      batch_no: z.string().max(80).optional().nullable(),
      expiry_date: z.string().optional().nullable(),
      stock_qty: z.number().int().min(0).default(0),
      purchase_price: z.number().min(0).default(0),
      sale_price: z.number().min(0).default(0),
      min_stock_level: z.number().int().min(0).default(10),
      barcode: z.string().max(80).optional().nullable(),
      unit: z.string().max(40).default("tablet"),
      notes: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { slug, ...rest } = data;
    const hid = await getHospitalId(context.supabase, slug);
    const { data: row, error } = await context.supabase.from("pharmacy_medicines")
      .insert({ ...rest, hospital_id: hid, expiry_date: rest.expiry_date || null })
      .select().single();
    if (error) throw new Error(error.message);
    return { medicine: row };
  });

export const updateMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        name: z.string().min(1).max(200).optional(),
        generic_name: z.string().max(200).nullable().optional(),
        category_id: z.string().uuid().nullable().optional(),
        company: z.string().max(120).nullable().optional(),
        batch_no: z.string().max(80).nullable().optional(),
        expiry_date: z.string().nullable().optional(),
        stock_qty: z.number().int().min(0).optional(),
        purchase_price: z.number().min(0).optional(),
        sale_price: z.number().min(0).optional(),
        min_stock_level: z.number().int().min(0).optional(),
        barcode: z.string().max(80).nullable().optional(),
        unit: z.string().max(40).optional(),
        notes: z.string().max(500).nullable().optional(),
        active: z.boolean().optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pharmacy_medicines").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pharmacy_medicines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const medicineRowSchema = z.object({
  name: z.string().min(1).max(200),
  generic_name: z.string().max(200).optional().nullable(),
  company: z.string().max(120).optional().nullable(),
  batch_no: z.string().max(80).optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  stock_qty: z.number().int().min(0).default(0),
  purchase_price: z.number().min(0).default(0),
  sale_price: z.number().min(0).default(0),
  min_stock_level: z.number().int().min(0).default(10),
  barcode: z.string().max(80).optional().nullable(),
  unit: z.string().max(40).default("tablet"),
  notes: z.string().max(500).optional().nullable(),
});

export const bulkCreateMedicines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      rows: z.array(medicineRowSchema).min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hid = await getHospitalId(context.supabase, data.slug);
    const payload = data.rows.map((r) => ({ ...r, hospital_id: hid, expiry_date: r.expiry_date || null }));
    const { data: rows, error } = await context.supabase
      .from("pharmacy_medicines").insert(payload).select("id");
    if (error) throw new Error(error.message);
    return { inserted: rows?.length ?? 0 };
  });

export const extractMedicinesFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      // data URL: data:image/png;base64,... or data:application/pdf;base64,...
      file_data_url: z.string().min(50).max(20_000_000),
      mime_type: z.string().max(120),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured (missing LOVABLE_API_KEY)");
    const model = createLovableAiGatewayProvider(key)("google/gemini-2.5-flash");

    const isImage = data.mime_type.startsWith("image/");
    const userParts: any[] = [
      {
        type: "text",
        text: `Extract every medicine row visible in this document. Return STRICT JSON only, no commentary, matching this shape:
{"medicines":[{"name":"","generic_name":"","company":"","batch_no":"","expiry_date":"YYYY-MM-DD or null","stock_qty":0,"purchase_price":0,"sale_price":0,"unit":"tablet","barcode":""}]}
- Use null for unknown text fields.
- stock_qty/purchase_price/sale_price must be numbers (0 if unknown).
- expiry_date must be ISO date or null.
- Unit examples: tablet, capsule, bottle, syrup, injection.`,
      },
    ];
    if (isImage) {
      userParts.push({ type: "image", image: data.file_data_url });
    } else {
      userParts.push({ type: "text", text: `Document mime: ${data.mime_type}. Treat the next attachment as a medicine list.` });
      userParts.push({ type: "image", image: data.file_data_url });
    }

    const { text } = await generateText({
      model,
      system: "You are an OCR + data-extraction assistant for pharmacy inventory. Output JSON only.",
      messages: [{ role: "user", content: userParts as any }],
    });

    // Extract JSON block
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned no JSON. Try a clearer photo or PDF.");
    let parsed: any;
    try { parsed = JSON.parse(match[0]); }
    catch { throw new Error("AI returned invalid JSON. Try again."); }

    const meds = Array.isArray(parsed?.medicines) ? parsed.medicines : [];
    const cleaned = meds.map((m: any) => ({
      name: String(m.name ?? "").slice(0, 200),
      generic_name: m.generic_name ? String(m.generic_name).slice(0, 200) : null,
      company: m.company ? String(m.company).slice(0, 120) : null,
      batch_no: m.batch_no ? String(m.batch_no).slice(0, 80) : null,
      expiry_date: m.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(String(m.expiry_date)) ? String(m.expiry_date) : null,
      stock_qty: Math.max(0, Math.floor(Number(m.stock_qty) || 0)),
      purchase_price: Math.max(0, Number(m.purchase_price) || 0),
      sale_price: Math.max(0, Number(m.sale_price) || 0),
      min_stock_level: 10,
      barcode: m.barcode ? String(m.barcode).slice(0, 80) : null,
      unit: m.unit ? String(m.unit).slice(0, 40) : "tablet",
      notes: null,
    })).filter((m: any) => m.name);

    return { medicines: cleaned };
  });


export const adjustMedicineStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), delta: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cur, error: e1 } = await context.supabase
      .from("pharmacy_medicines").select("stock_qty").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    const next = Math.max(0, (cur?.stock_qty ?? 0) + data.delta);
    const { error } = await context.supabase.from("pharmacy_medicines").update({ stock_qty: next }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { stock_qty: next };
  });

export const getPharmacyDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const since30 = new Date(); since30.setDate(since30.getDate() - 30);
    const expSoon = new Date(); expSoon.setDate(expSoon.getDate() + 30);

    const [{ data: meds }, { data: salesToday }, { data: sales30 }, { data: lowStock }, { data: expiring }] = await Promise.all([
      supabase.from("pharmacy_medicines").select("id, stock_qty, sale_price, purchase_price").eq("hospital_id", hid),
      supabase.from("pharmacy_sales").select("id, total, created_at").eq("hospital_id", hid).gte("created_at", today.toISOString()),
      supabase.from("pharmacy_sales").select("id, total, created_at").eq("hospital_id", hid).gte("created_at", since30.toISOString()).order("created_at"),
      supabase.from("pharmacy_medicines").select("id, name, stock_qty, min_stock_level").eq("hospital_id", hid).limit(50),
      supabase.from("pharmacy_medicines").select("id, name, expiry_date, stock_qty").eq("hospital_id", hid).not("expiry_date", "is", null).lte("expiry_date", expSoon.toISOString().slice(0, 10)).order("expiry_date").limit(50),
    ]);

    const totalSkus = meds?.length ?? 0;
    const inventoryValue = (meds ?? []).reduce((s, m: any) => s + Number(m.stock_qty) * Number(m.sale_price ?? 0), 0);
    const totalStock = (meds ?? []).reduce((s, m: any) => s + Number(m.stock_qty), 0);
    const todayRevenue = (salesToday ?? []).reduce((s, x: any) => s + Number(x.total ?? 0), 0);
    const monthRevenue = (sales30 ?? []).reduce((s, x: any) => s + Number(x.total ?? 0), 0);

    // bucket sales into days
    const byDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); byDay.set(d.toISOString().slice(0, 10), 0); }
    for (const s of sales30 ?? []) {
      const k = new Date((s as any).created_at).toISOString().slice(0, 10);
      byDay.set(k, (byDay.get(k) ?? 0) + Number((s as any).total ?? 0));
    }
    const chart = Array.from(byDay.entries()).map(([date, total]) => ({ date: date.slice(5), total }));

    const low = (lowStock ?? []).filter((m: any) => m.stock_qty <= (m.min_stock_level ?? 10));

    return {
      kpis: { totalSkus, totalStock, inventoryValue, todayRevenue, monthRevenue, lowStockCount: low.length, expiringCount: (expiring ?? []).length },
      lowStock: low.slice(0, 10),
      expiring: (expiring ?? []).slice(0, 10),
      chart,
    };
  });

/** =================== POS / Customers / Sales =================== */

export const listPharmacyCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1), search: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await getHospitalId(context.supabase, data.slug);
    let q = context.supabase.from("pharmacy_customers").select("*").eq("hospital_id", hid).order("name").limit(200);
    if (data.search?.trim()) {
      const p = `%${data.search.trim()}%`;
      q = q.or(`name.ilike.${p},phone.ilike.${p},cnic.ilike.${p}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { customers: rows ?? [] };
  });

export const createPharmacyCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1).max(200),
      phone: z.string().max(40).optional().nullable(),
      cnic: z.string().max(40).optional().nullable(),
      address: z.string().max(300).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { slug, ...rest } = data;
    const hid = await getHospitalId(context.supabase, slug);
    const { data: row, error } = await context.supabase.from("pharmacy_customers")
      .insert({ ...rest, hospital_id: hid }).select().single();
    if (error) throw new Error(error.message);
    return { customer: row };
  });

export const createPharmacySale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      customer_id: z.string().uuid().optional().nullable(),
      customer_name: z.string().max(200).optional().nullable(),
      payment_method: z.enum(["cash", "card", "online", "credit"]).default("cash"),
      discount: z.number().min(0).default(0),
      discount_type: z.enum(["fixed", "percent"]).default("fixed"),
      tax: z.number().min(0).default(0),
      notes: z.string().max(500).optional().nullable(),
      items: z.array(z.object({
        medicine_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        qty: z.number().int().min(1),
        unit_price: z.number().min(0),
      })).min(1).max(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const hid = await getHospitalId(supabase, data.slug);

    const subtotal = data.items.reduce((s, it) => s + it.qty * it.unit_price, 0);
    const discountAmt = data.discount_type === "percent" ? (subtotal * data.discount) / 100 : data.discount;
    const total = Math.max(0, subtotal - discountAmt + data.tax);

    // Build invoice number from pharmacy settings (prefix + padding)
    const { data: settings } = await supabase
      .from("pharmacy_settings")
      .select("invoice_prefix, invoice_padding")
      .eq("hospital_id", hid)
      .maybeSingle();
    const prefix = (settings?.invoice_prefix as string | undefined)?.trim() || "INV";
    const padding = Math.min(10, Math.max(3, Number(settings?.invoice_padding ?? 6)));
    const year = new Date().getFullYear();
    const seq = String(Math.floor(Math.random() * Math.pow(10, padding))).padStart(padding, "0");
    const invoiceNo = `${prefix}-${year}-${seq}`;

    const { data: sale, error: sErr } = await supabase.from("pharmacy_sales").insert({
      hospital_id: hid,
      invoice_no: invoiceNo,
      customer_id: data.customer_id ?? null,
      customer_name_snapshot: data.customer_name ?? null,
      payment_method: data.payment_method,
      subtotal, discount: discountAmt, discount_type: data.discount_type,
      tax: data.tax, total,
      notes: data.notes ?? null,
      cashier_id: userId,
    }).select().single();
    if (sErr) throw new Error(sErr.message);


    const itemRows = data.items.map((it) => ({
      hospital_id: hid,
      sale_id: sale.id,
      medicine_id: it.medicine_id,
      medicine_name_snapshot: it.name,
      qty: it.qty,
      unit_price: it.unit_price,
      line_total: it.qty * it.unit_price,
    }));
    const { error: iErr } = await supabase.from("pharmacy_sale_items").insert(itemRows);
    if (iErr) throw new Error(iErr.message);

    await audit(supabase, {
      hospital_id: hid,
      actor_id: userId,
      action: "pharmacy.sale",
      entity_type: "pharmacy_sale",
      entity_id: sale.id,
      metadata: {
        invoice_no: invoiceNo,
        payment_method: data.payment_method,
        items_count: data.items.length,
        units: data.items.reduce((s, it) => s + it.qty, 0),
        subtotal, discount: discountAmt, tax: data.tax, total,
        customer_id: data.customer_id ?? null,
      },
    });

    return { sale };
  });

/** =================== Suppliers =================== */

export const listSuppliers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1), search: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await getHospitalId(context.supabase, data.slug);
    let q = context.supabase.from("pharmacy_suppliers").select("*").eq("hospital_id", hid).order("name").limit(500);
    if (data.search?.trim()) {
      const p = `%${data.search.trim()}%`;
      q = q.or(`name.ilike.${p},phone.ilike.${p},contact_person.ilike.${p}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { suppliers: rows ?? [] };
  });

export const upsertSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(200),
      contact_person: z.string().max(120).optional().nullable(),
      phone: z.string().max(40).optional().nullable(),
      email: z.string().max(120).optional().nullable(),
      address: z.string().max(300).optional().nullable(),
      notes: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { slug, id, ...rest } = data;
    const hid = await getHospitalId(context.supabase, slug);
    if (id) {
      const { error } = await context.supabase.from("pharmacy_suppliers").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { data: row, error } = await context.supabase.from("pharmacy_suppliers")
      .insert({ ...rest, hospital_id: hid }).select().single();
    if (error) throw new Error(error.message);
    return { supplier: row };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pharmacy_suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** =================== Purchases =================== */

export const listPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await getHospitalId(context.supabase, data.slug);
    const { data: rows, error } = await context.supabase
      .from("pharmacy_purchases")
      .select("*, supplier:pharmacy_suppliers(id,name)")
      .eq("hospital_id", hid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { purchases: rows ?? [] };
  });

export const createPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      supplier_id: z.string().uuid().optional().nullable(),
      reference_no: z.string().max(80).optional().nullable(),
      tax: z.number().min(0).default(0),
      notes: z.string().max(500).optional().nullable(),
      receive_now: z.boolean().default(false),
      items: z.array(z.object({
        medicine_id: z.string().uuid(),
        qty: z.number().int().min(1),
        purchase_price: z.number().min(0),
      })).min(1).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const subtotal = data.items.reduce((s, it) => s + it.qty * it.purchase_price, 0);
    const total = subtotal + data.tax;

    const { data: pur, error: pErr } = await supabase.from("pharmacy_purchases").insert({
      hospital_id: hid,
      supplier_id: data.supplier_id ?? null,
      reference_no: data.reference_no ?? null,
      subtotal, tax: data.tax, total,
      status: data.receive_now ? "received" : "pending",
      received_at: data.receive_now ? new Date().toISOString() : null,
      notes: data.notes ?? null,
      created_by: userId,
    }).select().single();
    if (pErr) throw new Error(pErr.message);

    const itemRows = data.items.map((it) => ({
      hospital_id: hid,
      purchase_id: pur.id,
      medicine_id: it.medicine_id,
      qty: it.qty,
      purchase_price: it.purchase_price,
      line_total: it.qty * it.purchase_price,
      received: data.receive_now,
    }));
    const { error: iErr } = await supabase.from("pharmacy_purchase_items").insert(itemRows);
    if (iErr) throw new Error(iErr.message);

    if (data.receive_now) {
      // Increment stock for each medicine
      for (const it of data.items) {
        const { data: cur } = await supabase.from("pharmacy_medicines").select("stock_qty").eq("id", it.medicine_id).single();
        await supabase.from("pharmacy_medicines").update({
          stock_qty: (cur?.stock_qty ?? 0) + it.qty,
          purchase_price: it.purchase_price,
        }).eq("id", it.medicine_id);
      }
      // Bump supplier balance
      if (data.supplier_id) {
        const { data: sup } = await supabase.from("pharmacy_suppliers").select("balance").eq("id", data.supplier_id).single();
        await supabase.from("pharmacy_suppliers").update({ balance: Number(sup?.balance ?? 0) + total }).eq("id", data.supplier_id);
      }
    }

    return { purchase: pur };
  });

export const receivePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pur, error } = await supabase.from("pharmacy_purchases")
      .select("*, items:pharmacy_purchase_items(*)").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (pur.status === "received") return { ok: true, alreadyReceived: true };

    for (const it of (pur.items ?? []) as any[]) {
      const { data: cur } = await supabase.from("pharmacy_medicines").select("stock_qty").eq("id", it.medicine_id).single();
      await supabase.from("pharmacy_medicines").update({
        stock_qty: (cur?.stock_qty ?? 0) + it.qty,
        purchase_price: it.purchase_price,
      }).eq("id", it.medicine_id);
    }
    await supabase.from("pharmacy_purchase_items").update({ received: true }).eq("purchase_id", pur.id);
    await supabase.from("pharmacy_purchases").update({ status: "received", received_at: new Date().toISOString() }).eq("id", pur.id);

    if (pur.supplier_id) {
      const { data: sup } = await supabase.from("pharmacy_suppliers").select("balance").eq("id", pur.supplier_id).single();
      await supabase.from("pharmacy_suppliers").update({ balance: Number(sup?.balance ?? 0) + Number(pur.total) }).eq("id", pur.supplier_id);
    }
    return { ok: true };
  });


export const getPharmacyReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slug: z.string().min(1),
    from: z.string(),
    to: z.string(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const fromIso = new Date(data.from).toISOString();
    const toIso = new Date(new Date(data.to).getTime() + 86400000).toISOString();

    const [salesRes, itemsRes, purRes] = await Promise.all([
      supabase.from("pharmacy_sales").select("id,total,subtotal,discount,tax,sold_at,payment_method,customer_name_snapshot,invoice_no")
        .eq("hospital_id", hid).gte("sold_at", fromIso).lt("sold_at", toIso).order("sold_at", { ascending: false }).limit(2000),
      supabase.from("pharmacy_sale_items").select("medicine_name_snapshot,qty,line_total,unit_price,sale_id,created_at")
        .eq("hospital_id", hid).gte("created_at", fromIso).lt("created_at", toIso).limit(5000),
      supabase.from("pharmacy_purchases").select("total,received_at,status")
        .eq("hospital_id", hid).eq("status", "received").gte("received_at", fromIso).lt("received_at", toIso).limit(2000),
    ]);
    if (salesRes.error) throw new Error(salesRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (purRes.error) throw new Error(purRes.error.message);

    const sales = salesRes.data ?? [];
    const items = itemsRes.data ?? [];
    const purchases = purRes.data ?? [];

    const totalRevenue = sales.reduce((s, r: any) => s + Number(r.total), 0);
    const totalDiscount = sales.reduce((s, r: any) => s + Number(r.discount ?? 0), 0);
    const totalTax = sales.reduce((s, r: any) => s + Number(r.tax ?? 0), 0);
    const totalPurchases = purchases.reduce((s, r: any) => s + Number(r.total), 0);
    const unitsSold = items.reduce((s, r: any) => s + Number(r.qty), 0);

    // Daily series
    const byDay = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const s of sales as any[]) {
      const d = new Date(s.sold_at).toISOString().slice(0, 10);
      const cur = byDay.get(d) ?? { date: d, revenue: 0, orders: 0 };
      cur.revenue += Number(s.total); cur.orders += 1;
      byDay.set(d, cur);
    }
    const daily = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Top medicines
    const byMed = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items as any[]) {
      const name = it.medicine_name_snapshot ?? "Unknown";
      const cur = byMed.get(name) ?? { name, qty: 0, revenue: 0 };
      cur.qty += Number(it.qty); cur.revenue += Number(it.line_total);
      byMed.set(name, cur);
    }
    const topMedicines = Array.from(byMed.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    // Payment mix
    const byPay = new Map<string, number>();
    for (const s of sales as any[]) byPay.set(s.payment_method, (byPay.get(s.payment_method) ?? 0) + Number(s.total));
    const paymentMix = Array.from(byPay.entries()).map(([method, amount]) => ({ method, amount }));

    return {
      kpis: { totalRevenue, totalDiscount, totalTax, totalPurchases, unitsSold, orders: sales.length },
      daily, topMedicines, paymentMix,
      recentSales: sales.slice(0, 25),
    };
  });

// ---------- Pharmacy Settings ----------

const DEFAULT_SETTINGS = {
  default_tax_percent: 0,
  default_discount_percent: 0,
  default_discount_type: "percent" as const,
  invoice_prefix: "INV",
  invoice_padding: 6,
  low_stock_threshold: 10,
  expiry_warning_days: 30,
  currency: "PKR",
  receipt_footer: "",
};

export const getPharmacySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const { data: row, error } = await supabase
      .from("pharmacy_settings")
      .select("*")
      .eq("hospital_id", hid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { settings: row ?? { hospital_id: hid, ...DEFAULT_SETTINGS } };
  });

export const upsertPharmacySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      default_tax_percent: z.number().min(0).max(100),
      default_discount_percent: z.number().min(0).max(100),
      default_discount_type: z.enum(["percent", "fixed"]),
      invoice_prefix: z.string().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/),
      invoice_padding: z.number().int().min(3).max(10),
      low_stock_threshold: z.number().int().min(0).max(10000),
      expiry_warning_days: z.number().int().min(1).max(365),
      currency: z.string().min(1).max(10),
      receipt_footer: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const { slug: _s, ...payload } = data;
    const { data: row, error } = await supabase
      .from("pharmacy_settings")
      .upsert({ hospital_id: hid, ...payload, receipt_footer: payload.receipt_footer ?? null }, { onConflict: "hospital_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { settings: row };
  });

/** =================== Dispense + Bill (POS draft from prescription) =================== */

export const dispenseAndBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      prescriptionId: z.string().uuid(),
      payment_method: z.enum(["cash", "card", "online", "credit"]).default("cash"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const hid = await getHospitalId(supabase, data.slug);

    const { data: rx, error: rxErr } = await supabase
      .from("prescriptions")
      .select("id, hospital_id, patient_id, doctor_id, medications")
      .eq("id", data.prescriptionId)
      .maybeSingle();
    if (rxErr) throw new Error(rxErr.message);
    if (!rx) throw new Error("Prescription not found");
    if (rx.hospital_id !== hid) throw new Error("Not authorized");

    const { data: existing } = await supabase
      .from("pharmacy_dispenses").select("id").eq("prescription_id", rx.id).maybeSingle();
    if (existing) return { alreadyDispensed: true, sale: null };

    // Match each med to a pharmacy medicine by name (ilike)
    const meds = (rx.medications as any[]) ?? [];
    const matched: { medicine_id: string; name: string; qty: number; unit_price: number }[] = [];
    const unmatched: string[] = [];
    for (const m of meds) {
      const name = (m?.name ?? "").toString().trim();
      if (!name) continue;
      const qty = Math.max(1, parseInt(m?.qty ?? m?.quantity ?? 1, 10) || 1);
      const { data: med } = await supabase
        .from("pharmacy_medicines")
        .select("id, name, sale_price")
        .eq("hospital_id", hid)
        .eq("active", true)
        .ilike("name", `%${name}%`)
        .limit(1)
        .maybeSingle();
      if (med) matched.push({ medicine_id: med.id, name: med.name, qty, unit_price: Number(med.sale_price ?? 0) });
      else unmatched.push(name);
    }

    let sale: any = null;
    if (matched.length > 0) {
      // Apply pharmacy settings defaults for discount/tax
      const { data: settings } = await supabase
        .from("pharmacy_settings")
        .select("invoice_prefix, invoice_padding, default_discount_percent, default_discount_type, default_tax_percent")
        .eq("hospital_id", hid)
        .maybeSingle();

      const subtotal = matched.reduce((s, it) => s + it.qty * it.unit_price, 0);
      const discountType = (settings?.default_discount_type as "percent" | "fixed") ?? "percent";
      const discountInput = Number(settings?.default_discount_percent ?? 0);
      const discountAmt = discountType === "percent" ? (subtotal * discountInput) / 100 : discountInput;
      const taxAmt = (subtotal * Number(settings?.default_tax_percent ?? 0)) / 100;
      const total = Math.max(0, subtotal - discountAmt + taxAmt);

      const prefix = (settings?.invoice_prefix as string | undefined)?.trim() || "INV";
      const padding = Math.min(10, Math.max(3, Number(settings?.invoice_padding ?? 6)));
      const year = new Date().getFullYear();
      const seq = String(Math.floor(Math.random() * Math.pow(10, padding))).padStart(padding, "0");
      const invoiceNo = `${prefix}-${year}-${seq}`;

      const { data: created, error: sErr } = await supabase.from("pharmacy_sales").insert({
        hospital_id: hid,
        invoice_no: invoiceNo,
        customer_id: null,
        customer_name_snapshot: null,
        payment_method: data.payment_method,
        subtotal, discount: discountAmt, discount_type: discountType,
        tax: taxAmt, total,
        notes: `Auto-billed from prescription ${rx.id}`,
        cashier_id: userId,
      }).select().single();
      if (sErr) throw new Error(sErr.message);
      sale = created;

      const itemRows = matched.map((it) => ({
        hospital_id: hid,
        sale_id: sale.id,
        medicine_id: it.medicine_id,
        medicine_name_snapshot: it.name,
        qty: it.qty,
        unit_price: it.unit_price,
        line_total: it.qty * it.unit_price,
      }));
      const { error: iErr } = await supabase.from("pharmacy_sale_items").insert(itemRows);
      if (iErr) throw new Error(iErr.message);

      await audit(supabase, {
        hospital_id: hid, actor_id: userId, action: "pharmacy.sale",
        entity_type: "pharmacy_sale", entity_id: sale.id,
        metadata: { invoice_no: invoiceNo, payment_method: data.payment_method, items_count: matched.length, total, source: "dispense" },
      });
    }

    // Insert dispense record (uses admin so trigger fires uniformly)
    const total = sale ? Number(sale.total) : 0;
    const { error: dErr } = await supabaseAdmin.from("pharmacy_dispenses").insert({
      hospital_id: hid,
      prescription_id: rx.id,
      patient_id: rx.patient_id,
      dispensed_by: userId,
      items: rx.medications ?? [],
      total,
    });
    if (dErr) throw new Error(dErr.message);

    // Notify doctor + patient
    const { data: pat } = await supabaseAdmin
      .from("patients").select("first_name, last_name, mrn, user_id").eq("id", rx.patient_id).maybeSingle();
    const patientName = pat ? `${pat.first_name} ${pat.last_name}` : "Patient";
    const notifs: any[] = [];
    if (rx.doctor_id) notifs.push({
      user_id: rx.doctor_id, hospital_id: hid, type: "prescription.dispensed",
      title: "Prescription dispensed",
      body: `Pharmacy dispensed medication for ${patientName} (${pat?.mrn ?? ""}).`,
      data: { prescription_id: rx.id, sale_id: sale?.id ?? null },
    });
    if (pat?.user_id) notifs.push({
      user_id: pat.user_id, hospital_id: hid, type: "prescription.dispensed",
      title: "Your medication is ready", body: "Your prescription has been dispensed at the pharmacy.",
      data: { prescription_id: rx.id, sale_id: sale?.id ?? null },
    });
    if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);

    await audit(supabaseAdmin, {
      hospital_id: hid, actor_id: userId, action: "pharmacy.dispense",
      entity_type: "prescription", entity_id: rx.id,
      metadata: {
        patient_id: rx.patient_id, doctor_id: rx.doctor_id,
        items_count: meds.length, matched: matched.length, unmatched, total,
        sale_id: sale?.id ?? null, invoice_no: sale?.invoice_no ?? null,
      },
    });

    return { ok: true, sale, matched: matched.length, unmatched };
  });

/** =================== Audit Logs =================== */

export const listPharmacyAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slug: z.string().min(1),
    from: z.string(),
    to: z.string(),
    limit: z.number().int().min(1).max(2000).default(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const hid = await getHospitalId(supabase, data.slug);
    const fromIso = new Date(data.from).toISOString();
    const toIso = new Date(new Date(data.to).getTime() + 86400000).toISOString();
    const { data: rows, error } = await supabase
      .from("audit_logs")
      .select("id, action, actor_id, entity_type, entity_id, metadata, created_at")
      .eq("hospital_id", hid)
      .in("action", ["pharmacy.sale", "pharmacy.dispense"])
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const actorIds = Array.from(new Set((rows ?? []).map((r: any) => r.actor_id).filter(Boolean)));
    let actors: Record<string, string> = {};
    if (actorIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("user_id, display_name, email").in("user_id", actorIds);
      for (const p of (profs ?? []) as any[]) actors[p.user_id] = p.display_name || p.email || p.user_id;
    }
    return { logs: (rows ?? []).map((r: any) => ({ ...r, actor_name: r.actor_id ? actors[r.actor_id] ?? r.actor_id : "System" })) };
  });
