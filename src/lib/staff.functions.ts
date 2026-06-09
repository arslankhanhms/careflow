import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STAFF_ROLES = ["owner","hospital_admin","doctor","nurse","receptionist","lab_tech","pharmacist","accountant","ward","daycare","opd","blood_bank","radiology"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

/** Public lookup of a hospital by slug — used by the per-hospital sign-in screen. */
export const getHospitalBySlugPublic = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("hospitals")
      .select("id, slug, name, logo_url, brand_color, city")
      .eq("slug", data.slug.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

async function getHospitalIdBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("hospitals").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hospital not found");
  return data.id as string;
}

async function isHospitalAdmin(userId: string, hospitalId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("hospital_id", hospitalId);
  if (data?.some((r) => r.role === "hospital_admin")) return true;
  const { data: sup } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  return !!sup;
}

/** Get the caller's role inside a hospital (by slug). */
export const getMyHospitalRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const hospitalId = await getHospitalIdBySlug(data.slug);

    // super_admin sees everything
    const { data: sup } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
    if (sup) return { role: "super_admin" as const, hospitalId };

    const { data: rows } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId).eq("hospital_id", hospitalId);
    const roles = (rows ?? []).map((r: any) => r.role as StaffRole);
    // Priority order — picks the highest-privilege role if user has multiple
    const order: StaffRole[] = ["owner","hospital_admin","doctor","nurse","receptionist","lab_tech","pharmacist","accountant","ward","daycare","opd","blood_bank","radiology"];
    const role = order.find((r) => roles.includes(r)) ?? null;
    return { role, hospitalId };
  });

/** List staff for a hospital (admin-only). */
export const listHospitalStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    if (!(await isHospitalAdmin(context.userId, hospitalId))) throw new Error("Forbidden");

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, display_name, email, phone, specialization, department, is_doctor, consultation_fee, created_at")
      .eq("hospital_id", hospitalId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const userIds = (profiles ?? []).map((p: any) => p.user_id);
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id, role").eq("hospital_id", hospitalId).in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p: any) => ({ ...p, roles: roleMap.get(p.user_id) ?? [] }));
  });

/** Create a staff member (hospital_admin only). */
export const createStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1).max(100),
      email: z.string().email(),
      password: z.string().min(8).max(128),
      displayName: z.string().min(2).max(120),
      phone: z.string().max(30).optional(),
      role: z.enum(STAFF_ROLES),
      specialization: z.string().max(120).optional(),
      department: z.string().max(120).optional(),
      consultationFee: z.number().min(0).max(1_000_000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    if (!(await isHospitalAdmin(context.userId, hospitalId))) throw new Error("Forbidden");

    // create user
    let userId: string;
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (created.error) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
      if (!existing) throw new Error(created.error.message);
      userId = existing.id;
    } else {
      userId = created.data.user!.id;
    }

    // profile
    await supabaseAdmin.from("profiles").upsert({
      user_id: userId,
      email: data.email,
      display_name: data.displayName,
      phone: data.phone || null,
      specialization: data.specialization || null,
      department: data.department || null,
      hospital_id: hospitalId,
      is_doctor: data.role === "doctor",
      consultation_fee: data.role === "doctor" ? (data.consultationFee ?? 0) : 0,
    }, { onConflict: "user_id" });

    // role
    await supabaseAdmin.from("user_roles").upsert({
      user_id: userId, hospital_id: hospitalId, role: data.role,
    }, { onConflict: "user_id,hospital_id,role" });

    return { userId, email: data.email };
  });

/** Update an existing staff member's profile + role (hospital_admin only). */
export const updateStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1).max(100),
      userId: z.string().uuid(),
      displayName: z.string().min(2).max(120).optional(),
      phone: z.string().max(30).optional(),
      role: z.enum(STAFF_ROLES).optional(),
      specialization: z.string().max(120).optional(),
      department: z.string().max(120).optional(),
      consultationFee: z.number().min(0).max(1_000_000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    if (!(await isHospitalAdmin(context.userId, hospitalId))) throw new Error("Forbidden");

    const patch: Record<string, any> = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.specialization !== undefined) patch.specialization = data.specialization || null;
    if (data.department !== undefined) patch.department = data.department || null;
    if (data.role) patch.is_doctor = data.role === "doctor";
    if (data.consultationFee !== undefined) patch.consultation_fee = data.consultationFee;
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin
        .from("profiles").update(patch as any).eq("user_id", data.userId).eq("hospital_id", hospitalId);
      if (error) throw new Error(error.message);
    }

    if (data.role) {
      // remove other hospital-scoped roles, then add the new one
      await supabaseAdmin.from("user_roles")
        .delete().eq("user_id", data.userId).eq("hospital_id", hospitalId);
      await supabaseAdmin.from("user_roles").insert({
        user_id: data.userId, hospital_id: hospitalId, role: data.role,
      });
    }
    return { ok: true };
  });

/** Reset a staff member's password (hospital_admin only). */
export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1).max(100),
      userId: z.string().uuid(),
      password: z.string().min(8).max(128),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    if (!(await isHospitalAdmin(context.userId, hospitalId))) throw new Error("Forbidden");

    // Verify the target user belongs to this hospital
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("user_id").eq("user_id", data.userId).eq("hospital_id", hospitalId).maybeSingle();
    if (!prof) throw new Error("Staff not found in this hospital");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Deactivate (revoke access to this hospital). Hospital admin only. Cannot remove self. */
export const deactivateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ slug: z.string().min(1).max(100), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hospitalId = await getHospitalIdBySlug(data.slug);
    if (!(await isHospitalAdmin(context.userId, hospitalId))) throw new Error("Forbidden");
    if (data.userId === context.userId) throw new Error("You cannot deactivate your own account");

    // Revoke all hospital-scoped roles
    await supabaseAdmin.from("user_roles")
      .delete().eq("user_id", data.userId).eq("hospital_id", hospitalId);
    // Unlink profile from hospital (keeps the user account intact)
    await supabaseAdmin.from("profiles")
      .update({ hospital_id: null, is_doctor: false })
      .eq("user_id", data.userId).eq("hospital_id", hospitalId);
    return { ok: true };
  });
