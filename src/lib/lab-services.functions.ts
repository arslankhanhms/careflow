import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Default lab catalog seeded the first time a hospital opens lab services. */
export const DEFAULT_LAB_CATALOG: { code: string; name: string; category: string }[] = [
  // Pathology / Hematology
  { code: "cbc", name: "Complete Blood Count (CBC)", category: "Pathology" },
  { code: "esr", name: "ESR", category: "Pathology" },
  { code: "blood_group", name: "Blood Group & Rh", category: "Pathology" },
  { code: "coag", name: "Coagulation (PT/INR/aPTT)", category: "Pathology" },
  // Biochemistry
  { code: "lft", name: "Liver Function Test (LFT)", category: "Biochemistry" },
  { code: "rft", name: "Renal Function Test (RFT)", category: "Biochemistry" },
  { code: "lipid", name: "Lipid Profile", category: "Biochemistry" },
  { code: "hba1c", name: "HbA1c", category: "Biochemistry" },
  { code: "bsr", name: "Blood Sugar Random", category: "Biochemistry" },
  { code: "tsh", name: "TSH", category: "Biochemistry" },
  // Microbiology / Serology
  { code: "urine_re", name: "Urine R/E", category: "Urology" },
  { code: "urine_culture", name: "Urine Culture", category: "Urology" },
  { code: "hbsag", name: "HBsAg", category: "Serology" },
  { code: "hcv", name: "Anti-HCV", category: "Serology" },
  { code: "hiv", name: "HIV Screening", category: "Serology" },
  { code: "covid_pcr", name: "COVID-19 PCR", category: "Microbiology" },
  // Radiology
  { code: "xray", name: "X-Ray", category: "Radiology" },
  { code: "usg", name: "Ultrasound (USG)", category: "Radiology" },
  { code: "ct", name: "CT Scan", category: "Radiology" },
  { code: "mri", name: "MRI", category: "Radiology" },
  { code: "ecg", name: "ECG", category: "Cardiology" },
  { code: "echo", name: "Echocardiography", category: "Cardiology" },
];

async function getHospitalIdBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("hospitals").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hospital not found");
  return data.id as string;
}

async function isHospitalAdminOrOwner(userId: string, hospitalId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("hospital_id", hospitalId);
  if (data?.some((r) => r.role === "hospital_admin" || r.role === "owner")) return true;
  const { data: sup } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  return !!sup;
}

async function ensureSeeded(hospitalId: string) {
  const { count } = await supabaseAdmin
    .from("hospital_lab_services").select("id", { count: "exact", head: true })
    .eq("hospital_id", hospitalId);
  if ((count ?? 0) > 0) return;
  const rows = DEFAULT_LAB_CATALOG.map((s) => ({
    hospital_id: hospitalId, code: s.code, name: s.name, category: s.category, enabled: true,
  }));
  await supabaseAdmin.from("hospital_lab_services").insert(rows);
}

/** List the full lab catalog for a hospital (seeds defaults on first call). */
export const listLabServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    await ensureSeeded(hospitalId);
    const { data: rows, error } = await supabaseAdmin
      .from("hospital_lab_services")
      .select("id, code, name, category, enabled, price, turnaround_min, urgent_default")
      .eq("hospital_id", hospitalId)
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Update price / turnaround / urgent_default for a lab service. Admin/Owner only. */
export const updateLabService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1).max(100),
      id: z.string().uuid(),
      price: z.number().min(0).max(10_000_000).optional(),
      turnaround_min: z.number().int().min(0).max(100000).optional(),
      urgent_default: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    if (!(await isHospitalAdminOrOwner(context.userId, hospitalId))) throw new Error("Forbidden");
    const patch: any = {};
    if (data.price !== undefined) patch.price = data.price;
    if (data.turnaround_min !== undefined) patch.turnaround_min = data.turnaround_min;
    if (data.urgent_default !== undefined) patch.urgent_default = data.urgent_default;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await supabaseAdmin
      .from("hospital_lab_services").update(patch)
      .eq("id", data.id).eq("hospital_id", hospitalId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Toggle one service on/off. Admin/Owner only. */
export const toggleLabService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1).max(100),
      id: z.string().uuid(),
      enabled: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    if (!(await isHospitalAdminOrOwner(context.userId, hospitalId))) throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("hospital_lab_services").update({ enabled: data.enabled })
      .eq("id", data.id).eq("hospital_id", hospitalId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Add a custom lab service. Admin/Owner only. */
export const addLabService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1).max(100),
      name: z.string().min(1).max(120),
      category: z.string().min(1).max(60),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    if (!(await isHospitalAdminOrOwner(context.userId, hospitalId))) throw new Error("Forbidden");
    const code = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) + "_" + Math.random().toString(36).slice(2, 6);
    const { error } = await supabaseAdmin.from("hospital_lab_services").insert({
      hospital_id: hospitalId, code, name: data.name, category: data.category, enabled: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Doctor/staff: lab catalog for the caller's own hospital (no slug required). */
export const listMyHospitalLabServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles").select("hospital_id").eq("user_id", context.userId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof?.hospital_id) return [] as any[];
    await ensureSeeded(prof.hospital_id);
    const { data: rows, error } = await supabaseAdmin
      .from("hospital_lab_services")
      .select("id, code, name, category, enabled, price")
      .eq("hospital_id", prof.hospital_id)
      .eq("enabled", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
