import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function hospitalIdBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("hospitals").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hospital not found");
  return data.id as string;
}

async function assertMember(userId: string, hospitalId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("hospital_id", hospitalId).limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden");
  return data[0].role as string;
}

function dayRange(date: string) {
  const d = new Date(date + "T00:00:00");
  const s = new Date(d);
  const e = new Date(d); e.setDate(e.getDate() + 1);
  return { startISO: s.toISOString(), endISO: e.toISOString() };
}

/** Request a daily collection closure (receptionist/accountant). Computes totals from real data. */
export const requestCollectionClosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1).max(100),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      doctorUserId: z.string().uuid().optional(),
      scope: z.enum(["opd", "all"]).default("opd"),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hid = await hospitalIdBySlug(data.slug);
    const role = await assertMember(context.userId, hid);
    const { startISO, endISO } = dayRange(data.date);

    // OPD totals are based on appointments scheduled for the selected date whose fee is paid.
    let apptQ = supabaseAdmin
      .from("appointments")
      .select("id, doctor_id, consultation_fee, concession_amount, payment_status")
      .eq("hospital_id", hid)
      .eq("payment_status", "paid")
      .gte("scheduled_at", startISO).lt("scheduled_at", endISO);
    if (data.doctorUserId) apptQ = apptQ.eq("doctor_id", data.doctorUserId);
    const { data: paidAppts, error: e1 } = await apptQ;
    if (e1) throw new Error(e1.message);
    const paidApptIds = (paidAppts ?? []).map((a: any) => a.id);
    const { data: pays } = paidApptIds.length
      ? await supabaseAdmin
          .from("payments")
          .select("amount,method,appointment_id,updated_at")
          .eq("hospital_id", hid)
          .in("status", ["paid", "completed"])
          .in("appointment_id", paidApptIds)
          .order("updated_at", { ascending: false })
      : { data: [] as any[] };

    const payByAppt = new Map<string, any>();
    for (const p of pays ?? []) if (p.appointment_id && !payByAppt.has(p.appointment_id)) payByAppt.set(p.appointment_id, p);
    let opd = 0, cash = 0, online = 0;
    for (const a of paidAppts || []) {
      const p = payByAppt.get(a.id);
      const amt = p ? Number(p.amount || 0) : Math.max(0, Number(a.consultation_fee || 0) - Number(a.concession_amount || 0));
      opd += amt;
      if ((p?.method || "cash").toLowerCase() === "cash" || (p?.method || "") === "cash_at_reception") cash += amt;
      else online += amt;
    }

    // Lab + Pharmacy only when scope = "all" (always hospital-wide for those streams)
    let lab = 0, pharm = 0;
    if (data.scope === "all") {
      const { data: labs } = await supabaseAdmin
        .from("lab_orders").select("paid_amount,payment_method")
        .eq("hospital_id", hid).eq("payment_status", "paid")
        .gte("paid_at", startISO).lt("paid_at", endISO);
      for (const l of labs || []) {
        const amt = Number(l.paid_amount || 0);
        lab += amt;
        if ((l.payment_method || "").toLowerCase() === "cash") cash += amt;
        else online += amt;
      }
      const { data: phs } = await supabaseAdmin
        .from("pharmacy_sales").select("total,payment_method")
        .eq("hospital_id", hid)
        .gte("created_at", startISO).lt("created_at", endISO);
      for (const s of phs || []) {
        const amt = Number(s.total || 0);
        pharm += amt;
        if ((s.payment_method || "").toLowerCase() === "cash") cash += amt;
        else online += amt;
      }
    }

    const grand = opd + lab + pharm;

    const { data: row, error: insErr } = await supabaseAdmin
      .from("collection_closures")
      .insert({
        hospital_id: hid,
        doctor_user_id: data.doctorUserId || null,
        closure_date: data.date,
        scope: data.doctorUserId ? "doctor" : data.scope === "all" ? "hospital" : "opd",
        opd_total: opd, lab_total: lab, pharmacy_total: pharm,
        cash_total: cash, online_total: online, grand_total: grand,
        status: "pending",
        requested_by: context.userId,
        notes: data.notes || null,
      })
      .select("*").single();
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin.from("financial_audit_log").insert({
      hospital_id: hid, actor_id: context.userId, actor_role: role,
      source: "manual", action: "create", table_name: "collection_closures",
      record_id: row.id, after_data: row, reason: "Closure requested",
    });

    // Notify the doctor (when scoped) or every owner/admin for hospital-wide closures
    const recipients = new Set<string>();
    if (data.doctorUserId) {
      recipients.add(data.doctorUserId);
    } else {
      const { data: admins } = await supabaseAdmin
        .from("user_roles").select("user_id,role")
        .eq("hospital_id", hid).in("role", ["doctor", "owner", "hospital_admin"]);
      for (const a of admins ?? []) recipients.add((a as any).user_id);
    }
    recipients.delete(context.userId);
    if (recipients.size > 0) {
      const fmtAmt = (n: number) => `Rs ${Number(n).toLocaleString()}`;
      await supabaseAdmin.from("notifications").insert(
        Array.from(recipients).map((uid) => ({
          user_id: uid,
          hospital_id: hid,
          type: "closure.requested",
          title: "Daily closure submitted for approval",
          body: `${data.date} · OPD ${fmtAmt(opd)}${data.scope === "all" ? ` · Lab ${fmtAmt(lab)} · Pharmacy ${fmtAmt(pharm)}` : ""} · Cash ${fmtAmt(cash)} · Online ${fmtAmt(online)}`,
          data: { closure_id: row.id, date: data.date, scope: row.scope },
        })),
      );
    }
    return { closure: row };
  });

/** Doctors at this hospital who receive OPD consultation fees (for the closure dropdown). */
export const listClosureDoctors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await hospitalIdBySlug(data.slug);
    await assertMember(context.userId, hid);

    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id")
      .eq("hospital_id", hid).eq("role", "doctor");
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (ids.length === 0) return { doctors: [] };
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("user_id, display_name, specialization, consultation_fee")
      .in("user_id", ids);
    const doctors = (profs ?? [])
      .filter((p: any) => Number(p.consultation_fee || 0) > 0)
      .map((p: any) => ({
        user_id: p.user_id,
        name: p.display_name || "Doctor",
        specialization: p.specialization || null,
        consultation_fee: Number(p.consultation_fee || 0),
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return { doctors };
  });

export const listCollectionClosures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slug: z.string().min(1).max(100),
    limit: z.number().min(1).max(200).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await hospitalIdBySlug(data.slug);
    await assertMember(context.userId, hid);
    const { data: rows, error } = await supabaseAdmin
      .from("collection_closures").select("*")
      .eq("hospital_id", hid)
      .order("closure_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return { closures: rows || [] };
  });

export const approveCollectionClosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slug: z.string().min(1).max(100),
    closureId: z.string().uuid(),
    decision: z.enum(["approved", "disputed"]),
    reason: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await hospitalIdBySlug(data.slug);
    const role = await assertMember(context.userId, hid);
    const allowedRoles = ["doctor", "owner", "hospital_admin"];
    if (!allowedRoles.includes(role)) throw new Error("Only doctors or admins can approve closures");

    const { data: before } = await supabaseAdmin
      .from("collection_closures").select("*").eq("id", data.closureId).single();

    const patch: any = {
      status: data.decision,
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
    };
    if (data.decision === "disputed") patch.dispute_reason = data.reason || "Disputed";

    const { data: row, error } = await supabaseAdmin
      .from("collection_closures").update(patch)
      .eq("id", data.closureId).eq("hospital_id", hid)
      .select("*").single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("financial_audit_log").insert({
      hospital_id: hid, actor_id: context.userId, actor_role: role,
      source: "manual", action: "update", table_name: "collection_closures",
      record_id: row.id, before_data: before, after_data: row,
      reason: `Closure ${data.decision}`,
    });
    if (row.requested_by && row.requested_by !== context.userId) {
      await supabaseAdmin.from("notifications").insert({
        user_id: row.requested_by,
        hospital_id: hid,
        type: "closure.decision",
        title: data.decision === "approved" ? "Closure request approved" : "Closure request disputed",
        body: `${row.closure_date} closure was ${data.decision}${data.reason ? `: ${data.reason}` : "."}`,
        data: { closure_id: row.id, status: data.decision },
      });
    }
    return { closure: row };
  });
