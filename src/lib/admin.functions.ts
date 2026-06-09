import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuperAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!data?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");
}

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createHospitalWithAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().min(2).max(120),
      slug: z.string().min(2).max(60).regex(slugRe, "lowercase letters, digits and hyphens only"),
      city: z.string().min(1).max(80),
      country: z.string().min(1).max(80).default("Pakistan"),
      plan: z.enum(["starter", "pro", "enterprise"]).default("starter"),
      adminEmail: z.string().email(),
      adminPassword: z.string().min(8).max(128),
      adminName: z.string().min(2).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    // Ensure slug unique
    const { data: existing } = await supabaseAdmin
      .from("hospitals").select("id").eq("slug", data.slug).maybeSingle();
    if (existing) throw new Error(`Slug "${data.slug}" already in use`);

    // 1) create hospital
    const { data: hosp, error: hErr } = await supabaseAdmin
      .from("hospitals").insert({
        name: data.name, slug: data.slug, city: data.city, country: data.country,
        plan: data.plan, status: "active",
      }).select("id, slug, name").single();
    if (hErr) throw new Error(hErr.message);

    // 2) create admin auth user (or reuse if email exists)
    let userId: string;
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.adminEmail, password: data.adminPassword, email_confirm: true,
      user_metadata: { display_name: data.adminName },
    });
    if (created.error) {
      // try fetch existing by email
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const found = list.users.find((u) => u.email?.toLowerCase() === data.adminEmail.toLowerCase());
      if (!found) {
        await supabaseAdmin.from("hospitals").delete().eq("id", hosp.id);
        throw new Error(created.error.message);
      }
      userId = found.id;
    } else {
      userId = created.data.user!.id;
    }

    // 3) upsert profile, link to hospital
    await supabaseAdmin.from("profiles").upsert({
      user_id: userId, email: data.adminEmail, display_name: data.adminName, hospital_id: hosp.id,
    }, { onConflict: "user_id" });

    // 4) add hospital_admin role (scoped to hospital)
    await supabaseAdmin.from("user_roles").upsert({
      user_id: userId, hospital_id: hosp.id, role: "hospital_admin",
    }, { onConflict: "user_id,hospital_id,role" });

    return { hospital: hosp, admin: { email: data.adminEmail, userId } };
  });

export const listHospitalsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { data: hospitals, error } = await supabaseAdmin
      .from("hospitals")
      .select("id, slug, name, city, country, plan, status, ai_credits_monthly, ai_credits_used, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (hospitals ?? []).map((h) => h.id);
    if (!ids.length) return { hospitals: [], totals: { patients: 0, doctors: 0, ai: 0 } };

    const [{ data: doctors }, { data: patients }] = await Promise.all([
      supabaseAdmin.from("profiles").select("hospital_id", { count: "exact" }).in("hospital_id", ids).eq("is_doctor", true),
      supabaseAdmin.from("patients").select("hospital_id").in("hospital_id", ids),
    ]);
    const docCounts = new Map<string, number>();
    (doctors ?? []).forEach((d: any) => docCounts.set(d.hospital_id, (docCounts.get(d.hospital_id) ?? 0) + 1));
    const patCounts = new Map<string, number>();
    (patients ?? []).forEach((p: any) => patCounts.set(p.hospital_id, (patCounts.get(p.hospital_id) ?? 0) + 1));

    const rows = (hospitals ?? []).map((h) => ({
      ...h,
      doctors: docCounts.get(h.id) ?? 0,
      patients: patCounts.get(h.id) ?? 0,
    }));
    return {
      hospitals: rows,
      totals: {
        patients: rows.reduce((s, h) => s + h.patients, 0),
        doctors: rows.reduce((s, h) => s + h.doctors, 0),
        ai: rows.reduce((s, h) => s + (h.ai_credits_used ?? 0), 0),
      },
    };
  });
