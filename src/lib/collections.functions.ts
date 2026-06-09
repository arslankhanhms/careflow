import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getHospitalIdBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("hospitals").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hospital not found");
  return data.id as string;
}

function dayRange(date?: string) {
  const d = date ? new Date(date) : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/**
 * Daily collections for a hospital: OPD + Lab + Pharmacy, split by Cash / Online.
 * Used by receptionist and admin dashboards.
 */
export const getDailyCollections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      slug: z.string().min(1).max(100),
      date: z.string().optional(), // YYYY-MM-DD
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hid = await getHospitalIdBySlug(data.slug);
    // Ensure caller belongs to hospital — RLS check via context.supabase
    const { error: chk } = await context.supabase
      .from("hospitals").select("id").eq("id", hid).maybeSingle();
    if (chk) throw new Error("Forbidden");

    const { startISO, endISO } = dayRange(data.date);

    const [pays, labs, pharm, appts] = await Promise.all([
      supabaseAdmin.from("payments")
        .select("amount, method, status, appointment_id, created_at")
        .eq("hospital_id", hid).gte("updated_at", startISO).lt("updated_at", endISO),
      supabaseAdmin.from("lab_orders")
        .select("paid_amount, payment_method, paid_at")
        .eq("hospital_id", hid).eq("payment_status", "paid")
        .gte("paid_at", startISO).lt("paid_at", endISO),
      supabaseAdmin.from("pharmacy_sales")
        .select("total, payment_method, sold_at")
        .eq("hospital_id", hid).gte("sold_at", startISO).lt("sold_at", endISO),
      supabaseAdmin.from("appointments")
        .select("id, doctor_id, consultation_fee, concession_amount, payment_status, updated_at")
        .eq("hospital_id", hid),
    ]);

    const cashLike = (m?: string | null) => m === "cash" || m === "cash_at_reception";
    const onlineLike = (m?: string | null) =>
      m === "card" || m === "online" || m === "bank_transfer" || m === "bank" || m === "jazzcash" || m === "easypaisa";

    const opd = { total: 0, cash: 0, online: 0, other: 0, count: 0 };
    for (const p of pays.data ?? []) {
      if (!p.appointment_id) continue;
      if (p.status && p.status !== "paid" && p.status !== "completed") continue;
      const a = Number(p.amount ?? 0);
      opd.total += a; opd.count += 1;
      if (cashLike(p.method)) opd.cash += a;
      else if (onlineLike(p.method)) opd.online += a;
      else opd.other += a;
    }

    const lab = { total: 0, cash: 0, online: 0, other: 0, count: 0 };
    for (const r of labs.data ?? []) {
      const a = Number(r.paid_amount ?? 0);
      lab.total += a; lab.count += 1;
      if (cashLike(r.payment_method)) lab.cash += a;
      else if (onlineLike(r.payment_method)) lab.online += a;
      else lab.other += a;
    }

    const pharmacy = { total: 0, cash: 0, online: 0, other: 0, count: 0 };
    for (const s of pharm.data ?? []) {
      const a = Number(s.total ?? 0);
      pharmacy.total += a; pharmacy.count += 1;
      if (cashLike(s.payment_method)) pharmacy.cash += a;
      else if (onlineLike(s.payment_method)) pharmacy.online += a;
      else pharmacy.other += a;
    }

    const grand = {
      total: opd.total + lab.total + pharmacy.total,
      cash: opd.cash + lab.cash + pharmacy.cash,
      online: opd.online + lab.online + pharmacy.online,
      other: opd.other + lab.other + pharmacy.other,
    };

    // Department-wise revenue (admin view): join doctor profile department/specialization
    const docIds = Array.from(new Set((appts.data ?? []).map((a: any) => a.doctor_id).filter(Boolean)));
    let docMap: Record<string, { department?: string; specialization?: string; name?: string }> = {};
    if (docIds.length) {
      const { data: docs } = await supabaseAdmin
        .from("profiles").select("user_id, display_name, department, specialization")
        .in("user_id", docIds);
      for (const d of docs ?? []) {
        docMap[d.user_id] = { department: d.department ?? undefined, specialization: d.specialization ?? undefined, name: d.display_name ?? undefined };
      }
    }
    const byDept: Record<string, { revenue: number; count: number }> = {};
    const byDoctor: Record<string, { revenue: number; count: number; name: string; department?: string; cash: number; online: number; other: number }> = {};
    const apptPayMap: Record<string, { amount: number; cash: number; online: number; other: number }> = {};
    for (const p of pays.data ?? []) {
      if (!p.appointment_id) continue;
      if (p.status && p.status !== "paid" && p.status !== "completed") continue;
      const amt = Number(p.amount ?? 0);
      const slot = (apptPayMap[p.appointment_id] = apptPayMap[p.appointment_id] || { amount: 0, cash: 0, online: 0, other: 0 });
      slot.amount += amt;
      if (cashLike(p.method)) slot.cash += amt;
      else if (onlineLike(p.method)) slot.online += amt;
      else slot.other += amt;
    }
    for (const a of appts.data ?? []) {
      const slot = apptPayMap[a.id];
      const paidOnSelectedDate = a.payment_status === "paid" && new Date(a.updated_at) >= new Date(startISO) && new Date(a.updated_at) < new Date(endISO);
      if (!slot && !paidOnSelectedDate) continue;
      const collected = slot?.amount ?? Math.max(0, Number(a.consultation_fee ?? 0) - Number(a.concession_amount ?? 0));
      if (!slot && paidOnSelectedDate) {
        opd.total += collected; opd.count += 1; opd.other += collected;
        grand.total += collected; grand.other += collected;
      }
      const info = a.doctor_id ? docMap[a.doctor_id] : null;
      const dept = info?.department || info?.specialization || "Unassigned";
      byDept[dept] = byDept[dept] || { revenue: 0, count: 0 };
      byDept[dept].revenue += collected;
      byDept[dept].count += 1;
      if (a.doctor_id) {
        const cur = byDoctor[a.doctor_id] || { revenue: 0, count: 0, name: info?.name || "Doctor", department: dept, cash: 0, online: 0, other: 0 };
        cur.revenue += collected;
        cur.count += 1;
        cur.cash += slot?.cash ?? 0;
        cur.online += slot?.online ?? 0;
        cur.other += slot?.other ?? (slot ? 0 : collected);
        byDoctor[a.doctor_id] = cur;
      }
    }

    return {
      date: startISO,
      opd, lab, pharmacy, grand,
      byDepartment: Object.entries(byDept)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue),
      byDoctor: Object.entries(byDoctor)
        .map(([id, v]) => ({ doctor_id: id, ...v }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  });
