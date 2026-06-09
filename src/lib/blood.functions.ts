import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];

async function getHospitalId(supabase: any, slug: string) {
  const { data, error } = await supabase.from("hospitals").select("id, name").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hospital not found");
  return data;
}

async function ensureInventoryRows(supabase: any, hospitalId: string) {
  const { data: existing } = await supabase
    .from("blood_inventory").select("blood_group").eq("hospital_id", hospitalId);
  const have = new Set((existing ?? []).map((r: any) => r.blood_group));
  const missing = BLOOD_GROUPS.filter((g) => !have.has(g));
  if (missing.length) {
    await supabase.from("blood_inventory").insert(
      missing.map((g) => ({ hospital_id: hospitalId, blood_group: g, units: 0 }))
    );
  }
}

export const listBloodBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const h = await getHospitalId(supabase, data.slug);
    await ensureInventoryRows(supabase, h.id);

    const { data: inv } = await supabase
      .from("blood_inventory")
      .select("id, blood_group, units, critical_level, low_level, updated_at")
      .eq("hospital_id", h.id);

    const sinceIso = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const { data: weekly } = await supabase
      .from("blood_donors").select("id")
      .eq("hospital_id", h.id).gte("donated_at", sinceIso);

    const { data: donors } = await supabase
      .from("blood_donors")
      .select("id, donor_name, cnic, phone, blood_group, units, donated_at, notes")
      .eq("hospital_id", h.id)
      .order("donated_at", { ascending: false })
      .limit(50);

    const sorted = (inv ?? []).sort(
      (a: any, b: any) => BLOOD_GROUPS.indexOf(a.blood_group) - BLOOD_GROUPS.indexOf(b.blood_group),
    );

    const { data: usages } = await supabase
      .from("blood_usages")
      .select("id, patient_name, patient_mrn, blood_group, units, reason, used_at, notes, product")
      .eq("hospital_id", h.id)
      .order("used_at", { ascending: false })
      .limit(50);

    return {
      inventory: sorted,
      donations_this_week: (weekly ?? []).length,
      donors: donors ?? [],
      usages: usages ?? [],
    };
  });

const PRODUCTS = ["whole_blood", "plasma", "rbc", "wbc", "platelets"] as const;

/** Record blood usage — which patient received how many units. */
export const recordBloodUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      patient_id: z.string().uuid().optional().nullable(),
      patient_name: z.string().min(1).max(120),
      patient_mrn: z.string().max(50).optional().nullable(),
      blood_group: z.enum(BLOOD_GROUPS as [string, ...string[]]),
      product: z.enum(PRODUCTS).default("whole_blood"),
      units: z.number().int().min(1).max(20),
      reason: z.string().max(200).optional().nullable(),
      notes: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const h = await getHospitalId(supabase, data.slug);

    // Stock check — only whole blood is tracked in inventory.
    if (data.product === "whole_blood") {
      await ensureInventoryRows(supabase, h.id);
      const { data: row } = await supabase
        .from("blood_inventory").select("id, units")
        .eq("hospital_id", h.id).eq("blood_group", data.blood_group).maybeSingle();
      const available = Number(row?.units ?? 0);
      if (available < data.units) {
        throw new Error(`${data.blood_group} not available. Only ${available} unit(s) in stock — required ${data.units}.`);
      }
      // decrement stock
      await supabase.from("blood_inventory")
        .update({ units: available - data.units, updated_at: new Date().toISOString() })
        .eq("id", row!.id);
    }

    const { error } = await supabase.from("blood_usages").insert({
      hospital_id: h.id,
      patient_id: data.patient_id || null,
      patient_name: data.patient_name,
      patient_mrn: data.patient_mrn || null,
      blood_group: data.blood_group,
      product: data.product,
      units: data.units,
      reason: data.reason || null,
      notes: data.notes || null,
      recorded_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordBloodDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      donor_name: z.string().min(1).max(120),
      cnic: z.string().max(20).optional().nullable(),
      phone: z.string().max(40).optional().nullable(),
      blood_group: z.enum(BLOOD_GROUPS as [string, ...string[]]),
      units: z.number().int().min(1).max(10),
      notes: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const h = await getHospitalId(supabase, data.slug);

    const { error: dErr } = await supabase.from("blood_donors").insert({
      hospital_id: h.id,
      donor_name: data.donor_name,
      cnic: data.cnic || null,
      phone: data.phone || null,
      blood_group: data.blood_group,
      units: data.units,
      notes: data.notes || null,
      recorded_by: userId,
    });
    if (dErr) throw new Error(dErr.message);

    await ensureInventoryRows(supabase, h.id);
    const { data: row } = await supabase
      .from("blood_inventory").select("id, units")
      .eq("hospital_id", h.id).eq("blood_group", data.blood_group).maybeSingle();
    if (row) {
      await supabase.from("blood_inventory")
        .update({ units: (row.units ?? 0) + data.units, updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
    return { ok: true };
  });

export const adjustBloodUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1),
      blood_group: z.enum(BLOOD_GROUPS as [string, ...string[]]),
      delta: z.number().int().min(-50).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const h = await getHospitalId(supabase, data.slug);
    await ensureInventoryRows(supabase, h.id);
    const { data: row } = await supabase
      .from("blood_inventory").select("id, units")
      .eq("hospital_id", h.id).eq("blood_group", data.blood_group).maybeSingle();
    if (!row) throw new Error("Inventory row missing");
    const next = Math.max(0, (row.units ?? 0) + data.delta);
    const { error } = await supabase.from("blood_inventory")
      .update({ units: next, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw new Error(error.message);
    return { units: next };
  });
