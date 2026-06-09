import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** List leaves for the signed-in doctor (or a specific doctor if provided) */
export const listDoctorLeaves = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { doctorUserId?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const target = data.doctorUserId || userId;
    const { data: rows, error } = await supabase
      .from("doctor_leaves")
      .select("*")
      .eq("doctor_user_id", target)
      .order("starts_on", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { leaves: rows ?? [] };
  });

/** List ALL active/upcoming leaves in this hospital — for admin/receptionist view */
export const listHospitalLeaves = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hospitalId?: string; hospitalSlug?: string }) =>
    z.object({
      hospitalId: z.string().uuid().optional(),
      hospitalSlug: z.string().min(1).max(100).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let hospitalId = data.hospitalId;
    if (!hospitalId && data.hospitalSlug) {
      const { data: h } = await supabase.from("hospitals").select("id").eq("slug", data.hospitalSlug).maybeSingle();
      hospitalId = h?.id;
    }
    if (!hospitalId) return { leaves: [] as any[] };
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await supabase
      .from("doctor_leaves")
      .select("*")
      .eq("hospital_id", hospitalId)
      .eq("status", "active")
      .gte("ends_on", today)
      .order("starts_on", { ascending: true });
    if (error) throw new Error(error.message);

    // Enrich with doctor names
    const docIds = Array.from(new Set((rows ?? []).map((r: any) => r.doctor_user_id)));
    let docMap: Record<string, string> = {};
    if (docIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", docIds);
      docMap = Object.fromEntries((profs ?? []).map((p: any) => [p.user_id, p.display_name || "Doctor"]));
    }
    return { leaves: (rows ?? []).map((r: any) => ({ ...r, doctor_name: docMap[r.doctor_user_id] || "Doctor" })) };
  });

const createSchema = z.object({
  hospitalId: z.string().uuid(),
  doctorUserId: z.string().uuid().optional(),
  startsOn: dateStr,
  endsOn: dateStr,
  reason: z.string().max(500).optional(),
});

export const createDoctorLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (new Date(data.endsOn) < new Date(data.startsOn)) {
      throw new Error("End date must be on or after start date");
    }
    const { data: row, error } = await supabase
      .from("doctor_leaves")
      .insert({
        hospital_id: data.hospitalId,
        doctor_user_id: data.doctorUserId || userId,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        reason: data.reason || null,
        created_by: userId,
        status: "active",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { leave: row };
  });

export const cancelDoctorLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("doctor_leaves")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
