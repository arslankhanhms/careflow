import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function localDayRange(date = new Date()) {
  const localKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(date);
  const start = new Date(`${localKey}T00:00:00+05:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end, key: localKey };
}

function dateKeyPK(input: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(input));
}

const isPaidStatus = (s?: string | null) => s === "paid" || s === "completed";
const isCashMethod = (m?: string | null) => m === "cash" || m === "cash_at_reception";

/** Resolves the current user's primary role + hospital slug/id. */
export const getMyRoleContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role, hospital_id").eq("user_id", userId);

    const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
    if (isSuper) return { role: "super_admin" as const, hospitalId: null, slug: null };

    const order = ["hospital_admin","doctor","nurse","receptionist","lab_tech","pharmacist","accountant"];
    let pick: any = null;
    for (const r of order) {
      const found = (roles ?? []).find((x: any) => x.role === r);
      if (found) { pick = found; break; }
    }
    if (!pick) return { role: null, hospitalId: null, slug: null };

    const { data: hosp } = await supabaseAdmin
      .from("hospitals").select("slug").eq("id", pick.hospital_id).maybeSingle();
    return { role: pick.role as string, hospitalId: pick.hospital_id as string, slug: hosp?.slug ?? null };
  });

/** Dashboard data appropriate for the caller's role (hospital-scoped). */
export const getStaffDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role, hospital_id").eq("user_id", userId);
    const order = ["hospital_admin","doctor","nurse","receptionist","lab_tech","pharmacist","accountant"];
    let pick: any = null;
    for (const r of order) {
      const found = (roles ?? []).find((x: any) => x.role === r);
      if (found) { pick = found; break; }
    }
    if (!pick) return { role: null };
    const hid = pick.hospital_id as string;
    const role = pick.role as string;

    const { start: todayStart, end: todayEnd } = localDayRange();
    const startIso = todayStart.toISOString(), endIso = todayEnd.toISOString();

    if (role === "receptionist" || role === "accountant" || role === "hospital_admin") {
      const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);
      const weekStartIso = weekStart.toISOString();
      const [
        { data: appts },
        { data: pays },
        { data: newPatients },
        { data: weekPays },
        { data: concs },
        { data: weekPaidAppts },
      ] = await Promise.all([
        supabaseAdmin.from("appointments")
          .select("id, scheduled_at, status, payment_status, queue_no, consultation_fee, concession_amount, updated_at, patient:patients(first_name,last_name,mrn,phone), doctor_id")
          .eq("hospital_id", hid).gte("scheduled_at", startIso).lt("scheduled_at", endIso).order("scheduled_at"),
        supabaseAdmin.from("payments")
          .select("id, amount, method, status, receipt_no, created_at, updated_at, patient_id, appointment_id")
          .eq("hospital_id", hid).gte("updated_at", startIso).lt("updated_at", endIso).order("updated_at", { ascending: false }),
        supabaseAdmin.from("patients")
          .select("id, first_name, last_name, mrn, created_at")
          .eq("hospital_id", hid).gte("created_at", startIso).lt("created_at", endIso).order("created_at", { ascending: false }),
        supabaseAdmin.from("payments")
          .select("amount, status, method, created_at, updated_at, appointment_id")
          .eq("hospital_id", hid).gte("updated_at", weekStartIso).lt("updated_at", endIso),
        supabaseAdmin.from("concession_requests")
          .select("id, amount, status, decided_at, created_at, patient_id, doctor_id, appointment_id")
          .eq("hospital_id", hid).eq("status", "approved")
          .gte("decided_at", weekStartIso).lt("decided_at", endIso),
        supabaseAdmin.from("appointments")
          .select("id, consultation_fee, concession_amount, payment_status, updated_at")
          .eq("hospital_id", hid).eq("payment_status", "paid")
          .gte("updated_at", weekStartIso).lt("updated_at", endIso),
      ]);

      const paidPaymentApptIds = new Set((weekPays ?? []).filter((p:any) => isPaidStatus(p.status) && p.appointment_id).map((p:any) => p.appointment_id));
      const todayFallbackAppts = (appts ?? []).filter((a:any) =>
        a.payment_status === "paid" && !paidPaymentApptIds.has(a.id) && new Date(a.updated_at) >= todayStart && new Date(a.updated_at) < todayEnd
      );
      const weekFallbackAppts = (weekPaidAppts ?? []).filter((a:any) => !paidPaymentApptIds.has(a.id));
      const fallbackAmount = (a:any) => Math.max(0, Number(a.consultation_fee || 0));
      const fallbackTodayRev = todayFallbackAppts.reduce((s:number, a:any) => s + fallbackAmount(a), 0);
      const fallbackWeekRev = weekFallbackAppts.reduce((s:number, a:any) => s + fallbackAmount(a), 0);

      const totalRev = (pays ?? []).filter((p:any) => isPaidStatus(p.status)).reduce((s:number, p:any) => s + Number(p.amount||0), 0) + fallbackTodayRev;
      const cashRev = (pays ?? []).filter((p:any) => isPaidStatus(p.status) && isCashMethod(p.method)).reduce((s:number, p:any) => s + Number(p.amount||0), 0) + fallbackTodayRev;
      const onlineRev = totalRev - cashRev;
      const weekRev = (weekPays ?? []).filter((p:any) => isPaidStatus(p.status)).reduce((s:number, p:any) => s + Number(p.amount||0), 0) + fallbackWeekRev;

      // Concession deduction (approved only)
      const todayConc = (concs ?? []).filter((c:any) => c.decided_at && new Date(c.decided_at) >= todayStart && new Date(c.decided_at) < todayEnd)
        .reduce((s:number, c:any) => s + Number(c.amount||0), 0);
      const weekConc = (concs ?? []).reduce((s:number, c:any) => s + Number(c.amount||0), 0);

      const payPatientIds = Array.from(new Set((pays ?? []).map((p:any) => p.patient_id).filter(Boolean)));
      const { data: payPatients } = payPatientIds.length
        ? await supabaseAdmin.from("patients").select("id, first_name, last_name").in("id", payPatientIds)
        : { data: [] as any[] };
      const payPatientMap = Object.fromEntries((payPatients ?? []).map((p:any) => [p.id, p]));
      const displayedPayments = [
        ...(pays ?? []).map((p:any) => ({ ...p, patient: payPatientMap[p.patient_id] ?? null })),
        ...todayFallbackAppts.map((a:any) => ({
          id: `appt-${a.id}`,
          amount: fallbackAmount(a),
          method: "cash",
          status: "paid",
          receipt_no: null,
          created_at: a.updated_at,
          updated_at: a.updated_at,
          patient: a.patient ?? null,
        })),
      ].sort((a:any, b:any) => +new Date(b.updated_at || b.created_at) - +new Date(a.updated_at || a.created_at));

      return {
        role, hospitalId: hid,
        appointments: appts ?? [],
        payments: displayedPayments,
        newPatients: newPatients ?? [],
        concessions: concs ?? [],
        revenue: {
          total: Math.max(0, totalRev - todayConc),
          cash: cashRev,
          online: onlineRev,
          week: Math.max(0, weekRev - weekConc),
          gross_total: totalRev,
          gross_week: weekRev,
          concession_today: todayConc,
          concession_week: weekConc,
        },
      };
    }

    if (role === "lab_tech") {
      const { data: orders } = await supabaseAdmin
        .from("lab_orders")
        .select("id, tests, priority, department, status, created_at, notes, patient:patients(first_name,last_name,mrn,phone)")
        .eq("hospital_id", hid)
        .in("status", ["ordered","sample_collected","processing"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false }).limit(100);
      return { role, hospitalId: hid, orders: orders ?? [] };
    }

    if (role === "pharmacist") {
      const since = new Date(); since.setDate(since.getDate() - 2);
      const { data: rx } = await supabaseAdmin
        .from("prescriptions")
        .select("id, issued_at, diagnosis, medications, patient:patients(first_name,last_name,mrn,phone)")
        .eq("hospital_id", hid).gte("issued_at", since.toISOString())
        .order("issued_at", { ascending: false }).limit(50);
      return { role, hospitalId: hid, prescriptions: rx ?? [] };
    }

    if (role === "nurse") {
      const { data: beds } = await supabaseAdmin
        .from("beds").select("id, label, status, ward:wards(name)").eq("hospital_id", hid);
      const { data: admissions } = await supabaseAdmin
        .from("admissions").select("id, admitted_at, diagnosis, patient:patients(first_name,last_name,mrn), bed_id")
        .eq("hospital_id", hid).is("discharged_at", null).order("admitted_at", { ascending: false });
      return { role, hospitalId: hid, beds: beds ?? [], admissions: admissions ?? [] };
    }

    // doctor / fallback
    const { data: appts } = await supabaseAdmin
      .from("appointments")
      .select("id, scheduled_at, queue_no, status, payment_status, patient:patients(first_name,last_name,mrn)")
      .eq("hospital_id", hid).eq("doctor_id", userId)
      .gte("scheduled_at", startIso).lt("scheduled_at", endIso).order("queue_no");
    return { role, hospitalId: hid, appointments: appts ?? [] };
  });

/** Receptionist/admin: per-doctor earnings & appointment counters (hospital-scoped).
 *  Includes today/total/cash/online/pending plus a 7-day series for each doctor. */
export const getDoctorEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role, hospital_id").eq("user_id", userId);
    const r = (roles ?? []).find((x: any) =>
      ["hospital_admin", "owner", "receptionist", "accountant"].includes(x.role));
    if (!r) return { doctors: [], series: {} as Record<string, number[]>, days: [] as string[] };
    const hid = r.hospital_id as string;

    const { start: todayStart, end: todayEnd } = localDayRange();
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);

    const [{ data: docs }, { data: appts }, { data: pays }, { data: concs }] = await Promise.all([
      supabaseAdmin.from("profiles")
        .select("user_id, display_name, specialization, consultation_fee")
        .eq("hospital_id", hid).eq("is_doctor", true),
      supabaseAdmin.from("appointments")
        .select("id, doctor_id, payment_status, consultation_fee, scheduled_at, status, updated_at")
        .eq("hospital_id", hid),
      supabaseAdmin.from("payments")
        .select("id, amount, status, method, created_at, updated_at, appointment_id")
        .eq("hospital_id", hid).in("status", ["paid", "completed"]),
      supabaseAdmin.from("concession_requests")
        .select("id, doctor_id, amount, status, decided_at, created_at")
        .eq("hospital_id", hid).eq("status", "approved"),
    ]);

    const apptToDoctor = new Map<string, string>();
    for (const a of appts ?? []) if (a.id && a.doctor_id) apptToDoctor.set(a.id, a.doctor_id);

    const sums: Record<string, {
      today: number; total: number; week: number;
      cash: number; online: number;
      appts: number; paid: number; pending: number;
      concession_today: number; concession_week: number; concession_total: number;
    }> = {};
    const bump = (id: string) => (sums[id] ||= { today: 0, total: 0, week: 0, cash: 0, online: 0, appts: 0, paid: 0, pending: 0, concession_today: 0, concession_week: 0, concession_total: 0 });

    for (const a of appts ?? []) {
      if (!a.doctor_id) continue;
      const s = bump(a.doctor_id);
      s.appts += 1;
      if (a.payment_status === "paid") s.paid += 1;
      else if (a.status !== "cancelled") s.pending += 1;
    }

    // Build 7-day buckets
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      days.push(dateKeyPK(d));
    }
    const series: Record<string, number[]> = {};

    for (const p of pays ?? []) {
      const did = p.appointment_id ? apptToDoctor.get(p.appointment_id) : null;
      if (!did) continue;
      const s = bump(did);
      const amt = Number(p.amount || 0);
      s.total += amt;
      if (isCashMethod(p.method)) s.cash += amt; else s.online += amt;
      // Bucket by when payment was marked paid (updated_at) — not when created.
      const when = new Date(p.updated_at || p.created_at);
      if (when >= todayStart && when < todayEnd) s.today += amt;
      if (when >= weekStart && when < todayEnd) {
        s.week += amt;
        const idx = days.indexOf(dateKeyPK(when));
        if (idx >= 0) {
          (series[did] ||= Array(7).fill(0))[idx] += amt;
        }
      }
    }

    const paidPaymentApptIds = new Set((pays ?? []).filter((p:any) => isPaidStatus(p.status) && p.appointment_id).map((p:any) => p.appointment_id));
    for (const a of appts ?? []) {
      if (!a.doctor_id || a.payment_status !== "paid" || paidPaymentApptIds.has(a.id)) continue;
      const s = bump(a.doctor_id);
      const amt = Math.max(0, Number(a.consultation_fee || 0));
      const when = new Date((a as any).updated_at || a.scheduled_at);
      s.total += amt;
      s.cash += amt;
      if (when >= todayStart && when < todayEnd) s.today += amt;
      if (when >= weekStart && when < todayEnd) {
        s.week += amt;
        const idx = days.indexOf(dateKeyPK(when));
        if (idx >= 0) (series[a.doctor_id] ||= Array(7).fill(0))[idx] += amt;
      }
    }

    // Deduct approved concessions per doctor
    for (const c of concs ?? []) {
      if (!c.doctor_id) continue;
      const s = bump(c.doctor_id);
      const amt = Number(c.amount || 0);
      const when = new Date(c.decided_at || c.created_at);
      s.concession_total += amt;
      if (when >= todayStart && when < todayEnd) s.concession_today += amt;
      if (when >= weekStart && when < todayEnd) s.concession_week += amt;
    }

    const rows = (docs ?? []).map((d: any) => {
      const s = sums[d.user_id];
      const today = Math.max(0, (s?.today ?? 0) - (s?.concession_today ?? 0));
      const week = Math.max(0, (s?.week ?? 0) - (s?.concession_week ?? 0));
      const total = Math.max(0, (s?.total ?? 0) - (s?.concession_total ?? 0));
      return {
        doctor_id: d.user_id,
        name: d.display_name,
        specialization: d.specialization,
        consultation_fee: Number(d.consultation_fee || 0),
        today_earnings: today,
        week_earnings: week,
        total_earnings: total,
        cash_earnings: s?.cash ?? 0,
        online_earnings: s?.online ?? 0,
        appointments_count: s?.appts ?? 0,
        paid_count: s?.paid ?? 0,
        pending_count: s?.pending ?? 0,
        concession_today: s?.concession_today ?? 0,
        concession_week: s?.concession_week ?? 0,
        concession_total: s?.concession_total ?? 0,
        series: series[d.user_id] ?? Array(7).fill(0),
      };
    }).sort((a, b) => b.today_earnings - a.today_earnings);

    return { doctors: rows, days };
  });

/** Doctor's own earnings — today / week / month / 30-day series / cash vs online / paid consultations breakdown. */
export const getMyDoctorEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { start: todayStart, end: todayEnd } = localDayRange();
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(todayStart); monthStart.setDate(monthStart.getDate() - 29);

    const [{ data: appts }, { data: pays }, { data: prof }, { data: labs }, { data: pharm }, { data: concs }] = await Promise.all([
      supabaseAdmin.from("appointments")
        .select("id, patient_id, payment_status, consultation_fee, scheduled_at, status, updated_at")
        .eq("doctor_id", userId),
      supabaseAdmin.from("payments")
        .select("id, amount, status, method, created_at, updated_at, appointment_id, receipt_no, patient_id")
        .in("status", ["paid", "completed"]),
      supabaseAdmin.from("profiles")
        .select("display_name, specialization, consultation_fee").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("lab_orders")
        .select("id, total_amount, doctor_commission_percent, created_at, completed_at, status, patient_id, tests")
        .eq("referring_doctor_id", userId),
      supabaseAdmin.from("pharmacy_dispenses")
        .select("id, total, doctor_commission_percent, created_at, patient_id")
        .eq("referring_doctor_id", userId),
      supabaseAdmin.from("concession_requests")
        .select("id, amount, status, decided_at, created_at, patient_id, appointment_id")
        .eq("doctor_id", userId).eq("status", "approved"),
    ]);

    const myApptIds = new Set((appts ?? []).map((a: any) => a.id));
    const mine = (pays ?? []).filter((p: any) => p.appointment_id && myApptIds.has(p.appointment_id));

    const days: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(monthStart); d.setDate(monthStart.getDate() + i);
      days.push(dateKeyPK(d));
    }
    const series: number[] = Array(30).fill(0);

    let today = 0, week = 0, month = 0, total = 0, cash = 0, online = 0;
    for (const p of mine) {
      const amt = Number(p.amount || 0);
      total += amt;
      if (isCashMethod(p.method)) cash += amt; else online += amt;
      const when = new Date(p.updated_at || p.created_at);
      if (when >= todayStart && when < todayEnd) today += amt;
      if (when >= weekStart && when < todayEnd) week += amt;
      if (when >= monthStart && when < todayEnd) {
        month += amt;
        const idx = days.indexOf(dateKeyPK(when));
        if (idx >= 0) series[idx] += amt;
      }
    }

    const paidPaymentApptIds = new Set(mine.map((p: any) => p.appointment_id).filter(Boolean));
    for (const a of appts ?? []) {
      if (a.payment_status !== "paid" || paidPaymentApptIds.has(a.id)) continue;
      const amt = Number(a.consultation_fee || 0);
      const when = new Date(a.updated_at || a.scheduled_at);
      total += amt;
      cash += amt;
      if (when >= todayStart && when < todayEnd) today += amt;
      if (when >= weekStart && when < todayEnd) week += amt;
      if (when >= monthStart && when < todayEnd) {
        month += amt;
        const idx = days.indexOf(dateKeyPK(when));
        if (idx >= 0) series[idx] += amt;
      }
    }

    // Lab referral commissions
    let labTotal = 0, labToday = 0, labWeek = 0, labMonth = 0;
    const labBreakdown: any[] = [];
    for (const l of labs ?? []) {
      const commission = Number(l.total_amount || 0) * Number(l.doctor_commission_percent || 0) / 100;
      if (!commission) continue;
      const when = new Date(l.completed_at || l.created_at);
      labTotal += commission;
      if (when >= todayStart && when < todayEnd) labToday += commission;
      if (when >= weekStart && when < todayEnd) labWeek += commission;
      if (when >= monthStart && when < todayEnd) labMonth += commission;
      labBreakdown.push({
        id: l.id, date: l.completed_at || l.created_at,
        tests: Array.isArray(l.tests) ? l.tests.join(", ") : "",
        amount: Number(l.total_amount || 0),
        percent: Number(l.doctor_commission_percent || 0),
        commission,
      });
    }

    // Pharmacy referral commissions
    let pharmTotal = 0, pharmToday = 0, pharmWeek = 0, pharmMonth = 0;
    const pharmBreakdown: any[] = [];
    for (const ph of pharm ?? []) {
      const commission = Number(ph.total || 0) * Number(ph.doctor_commission_percent || 0) / 100;
      if (!commission) continue;
      const when = new Date(ph.created_at);
      pharmTotal += commission;
      if (when >= todayStart && when < todayEnd) pharmToday += commission;
      if (when >= weekStart && when < todayEnd) pharmWeek += commission;
      if (when >= monthStart && when < todayEnd) pharmMonth += commission;
      pharmBreakdown.push({
        id: ph.id, date: ph.created_at,
        amount: Number(ph.total || 0),
        percent: Number(ph.doctor_commission_percent || 0),
        commission,
      });
    }

    // Patient names for the paid consultations breakdown
    const patientIds = Array.from(new Set(mine.map((p: any) => p.patient_id).filter(Boolean))) as string[];
    let patientMap: Record<string, string> = {};
    if (patientIds.length) {
      const { data: pts } = await supabaseAdmin
        .from("patients").select("id, first_name, last_name, mrn").in("id", patientIds);
      patientMap = Object.fromEntries((pts ?? []).map((p: any) => [
        p.id,
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() + (p.mrn ? ` · ${p.mrn}` : ""),
      ]));
    }

    const paidConsultations = mine
      .map((p: any) => ({
        id: p.id as string,
        date: (p.updated_at || p.created_at) as string,
        patient: (p.patient_id && patientMap[p.patient_id]) || "—",
        amount: Number(p.amount || 0),
        method: (p.method ?? "cash") as string,
        receipt_no: (p.receipt_no ?? null) as string | null,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const paidAppts = (appts ?? []).filter((a: any) => a.payment_status === "paid").length;
    const pendingAppts = (appts ?? []).filter((a: any) => a.payment_status !== "paid" && a.status !== "cancelled").length;

    // Approved-concession deductions (doctor's giveaways)
    let concToday = 0, concWeek = 0, concMonth = 0, concTotal = 0;
    for (const c of concs ?? []) {
      const amt = Number(c.amount || 0);
      const when = new Date(c.decided_at || c.created_at);
      concTotal += amt;
      if (when >= todayStart && when < todayEnd) concToday += amt;
      if (when >= weekStart && when < todayEnd) concWeek += amt;
      if (when >= monthStart && when < todayEnd) concMonth += amt;
    }

    const netToday = Math.max(0, today - concToday);
    const netWeek = Math.max(0, week - concWeek);
    const netMonth = Math.max(0, month - concMonth);
    const netTotal = Math.max(0, total - concTotal);

    return {
      profile: prof, days, series,
      totals: {
        today: netToday, week: netWeek, month: netMonth, total: netTotal,
        cash, online,
        consultations: netTotal,
        labCommission: labTotal,
        pharmacyCommission: pharmTotal,
        grandTotal: netTotal + labTotal + pharmTotal,
        concession_today: concToday,
        concession_week: concWeek,
        concession_total: concTotal,
        gross_today: today,
        gross_week: week,
      },
      breakdown: {
        consultations: { today: netToday, week: netWeek, month: netMonth, total: netTotal },
        lab:        { today: labToday,  week: labWeek,  month: labMonth,  total: labTotal },
        pharmacy:   { today: pharmToday, week: pharmWeek, month: pharmMonth, total: pharmTotal },
        concessions:{ today: concToday, week: concWeek, month: concMonth, total: concTotal },
      },
      counts: { appts: (appts ?? []).length, paid: paidAppts, pending: pendingAppts },
      paidConsultations,
      labReferrals: labBreakdown.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      pharmacyReferrals: pharmBreakdown.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    };
  });

/** Distinct patients the doctor has seen (appointments + prescriptions), with quick history counts. */
export const getMyDoctorPatients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const [{ data: appts }, { data: rx }] = await Promise.all([
      supabaseAdmin.from("appointments")
        .select("patient_id, scheduled_at, status")
        .eq("doctor_id", userId).order("scheduled_at", { ascending: false }),
      supabaseAdmin.from("prescriptions")
        .select("patient_id, issued_at, diagnosis")
        .eq("doctor_id", userId).order("issued_at", { ascending: false }),
    ]);

    const stats = new Map<string, { visits: number; rx: number; lastSeen: string | null; lastDiagnosis: string | null }>();
    const touch = (pid: string) => {
      if (!stats.has(pid)) stats.set(pid, { visits: 0, rx: 0, lastSeen: null, lastDiagnosis: null });
      return stats.get(pid)!;
    };
    for (const a of appts ?? []) {
      if (!a.patient_id) continue;
      const s = touch(a.patient_id);
      s.visits++;
      if (!s.lastSeen || a.scheduled_at > s.lastSeen) s.lastSeen = a.scheduled_at;
    }
    for (const p of rx ?? []) {
      if (!p.patient_id) continue;
      const s = touch(p.patient_id);
      s.rx++;
      if (!s.lastDiagnosis && p.diagnosis) s.lastDiagnosis = p.diagnosis;
    }

    const ids = Array.from(stats.keys());
    if (!ids.length) return { patients: [] as any[] };
    const { data: patients } = await supabaseAdmin
      .from("patients")
      .select("id, first_name, last_name, mrn, dob, gender, phone, blood_group, allergies, chronic_conditions")
      .in("id", ids);

    const rows = (patients ?? []).map((p: any) => ({
      ...p,
      visits: stats.get(p.id)?.visits ?? 0,
      rx_count: stats.get(p.id)?.rx ?? 0,
      last_seen: stats.get(p.id)?.lastSeen ?? null,
      last_diagnosis: stats.get(p.id)?.lastDiagnosis ?? null,
    })).sort((a, b) => (b.last_seen || "").localeCompare(a.last_seen || ""));
    return { patients: rows };
  });

/** Full profile for one patient (doctor must have treated them). */
export const getMyDoctorPatientProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patientId: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    // Verify this patient was seen by this doctor (RLS + ownership)
    const { data: linked } = await supabaseAdmin.from("appointments")
      .select("id").eq("doctor_id", userId).eq("patient_id", data.patientId).limit(1);
    const { data: linkedRx } = await supabaseAdmin.from("prescriptions")
      .select("id").eq("doctor_id", userId).eq("patient_id", data.patientId).limit(1);
    if (!(linked?.length || linkedRx?.length)) throw new Error("Not authorized for this patient");

    const [{ data: patient }, { data: appts }, { data: prescriptions }, { data: labOrders }, { data: vitals }] = await Promise.all([
      supabaseAdmin.from("patients").select("*").eq("id", data.patientId).maybeSingle(),
      supabaseAdmin.from("appointments")
        .select("id, scheduled_at, status, reason, notes, payment_status, consultation_fee")
        .eq("patient_id", data.patientId).eq("doctor_id", userId)
        .order("scheduled_at", { ascending: false }),
      supabaseAdmin.from("prescriptions")
        .select("id, issued_at, diagnosis, notes, medications, vitals, symptoms, examination, suggested_treatment, follow_up_date, follow_up_notes, lab_tests")
        .eq("patient_id", data.patientId).order("issued_at", { ascending: false }),
      supabaseAdmin.from("lab_orders")
        .select("id, created_at, status, tests, priority, payment_status")
        .eq("patient_id", data.patientId).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("vitals")
        .select("recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, spo2, weight_kg, height_cm")
        .eq("patient_id", data.patientId).order("recorded_at", { ascending: false }).limit(10),
    ]);
    // Compose "active complaints" from the most-recent appointment reasons + recent symptoms
    const recentComplaints = Array.from(new Set([
      ...((appts ?? []).slice(0, 5).map((a: any) => a.reason).filter(Boolean)),
      ...((prescriptions ?? []).slice(0, 3).flatMap((p: any) => Array.isArray(p.symptoms) ? p.symptoms : [])),
    ]));
    return {
      patient,
      appointments: appts ?? [],
      prescriptions: prescriptions ?? [],
      labOrders: labOrders ?? [],
      vitals: vitals ?? [],
      activeComplaints: recentComplaints,
    };
  });

/** Schedule a next checkup as a follow-up entry for one of this doctor's patients. */
export const scheduleNextCheckup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patientId: string; dueDate: string; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { data: pat } = await supabaseAdmin.from("patients")
      .select("hospital_id").eq("id", data.patientId).maybeSingle();
    if (!pat?.hospital_id) throw new Error("Patient not found");

    const { error } = await supabaseAdmin.from("follow_ups").insert({
      hospital_id: pat.hospital_id,
      patient_id: data.patientId,
      doctor_id: userId,
      due_date: data.dueDate,
      notes: data.notes || null,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      hospital_id: pat.hospital_id,
      type: "follow_up",
      title: "Next checkup scheduled",
      body: `Patient follow-up booked for ${data.dueDate}.`,
    });
    return { ok: true };
  });

/** Receptionist view: every doctor's working schedule + today's slot availability. */
export const getDoctorsScheduleOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role, hospital_id").eq("user_id", userId);
    const r = (roles ?? []).find((x: any) =>
      ["hospital_admin", "owner", "receptionist", "accountant", "nurse"].includes(x.role));
    if (!r) return { doctors: [] as any[] };
    const hid = r.hospital_id as string;

    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const dayKey = ["sun","mon","tue","wed","thu","fri","sat"][todayStart.getDay()];

    const [{ data: docs }, { data: appts }] = await Promise.all([
      supabaseAdmin.from("profiles")
        .select("user_id, display_name, specialization, photo_url, consultation_fee, working_days, working_hours, slot_duration_min, max_patients_per_day")
        .eq("hospital_id", hid).eq("is_doctor", true),
      supabaseAdmin.from("appointments")
        .select("id, doctor_id, scheduled_at, status, patient:patients(first_name,last_name,mrn)")
        .eq("hospital_id", hid)
        .gte("scheduled_at", todayStart.toISOString())
        .lt("scheduled_at", todayEnd.toISOString()),
    ]);

    const byDoc = new Map<string, any[]>();
    for (const a of appts ?? []) {
      if (!a.doctor_id) continue;
      if (!byDoc.has(a.doctor_id)) byDoc.set(a.doctor_id, []);
      byDoc.get(a.doctor_id)!.push(a);
    }

    const rows = (docs ?? []).map((d: any) => {
      const todaysAppts = (byDoc.get(d.user_id) ?? []).sort(
        (a: any, b: any) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)
      );
      const wh = d.working_hours ?? { start: "09:00", end: "17:00" };
      const slotMin = d.slot_duration_min ?? 15;
      const workingDays = d.working_days ?? ["mon","tue","wed","thu","fri"];
      const isWorkingToday = workingDays.includes(dayKey);

      // Compute total possible slots for today
      const [sh, sm] = String(wh.start || "09:00").split(":").map(Number);
      const [eh, em] = String(wh.end || "17:00").split(":").map(Number);
      const totalMin = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
      const totalSlots = isWorkingToday ? Math.floor(totalMin / slotMin) : 0;
      const booked = todaysAppts.filter((a: any) => a.status !== "cancelled" && a.status !== "no_show").length;
      const free = Math.max(0, totalSlots - booked);

      // Next 4 upcoming appointments
      const now = Date.now();
      const upcoming = todaysAppts
        .filter((a: any) => +new Date(a.scheduled_at) >= now && a.status !== "cancelled")
        .slice(0, 4);

      return {
        doctor_id: d.user_id,
        name: d.display_name,
        specialization: d.specialization,
        photo_url: d.photo_url,
        consultation_fee: Number(d.consultation_fee || 0),
        working_days: workingDays,
        working_hours: wh,
        slot_duration_min: slotMin,
        is_working_today: isWorkingToday,
        total_slots: totalSlots,
        booked_slots: booked,
        free_slots: free,
        utilization: totalSlots > 0 ? Math.round((booked / totalSlots) * 100) : 0,
        upcoming,
        today_count: todaysAppts.length,
      };
    }).sort((a, b) => (b.is_working_today ? 1 : 0) - (a.is_working_today ? 1 : 0));

    return { doctors: rows };
  });

/** Upcoming follow-ups (scheduled checkups) for the signed-in doctor. */
export const getMyFollowUps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin
      .from("follow_ups")
      .select("id, due_date, notes, created_at, patient:patients(id, first_name, last_name, mrn, phone)")
      .eq("doctor_id", userId)
      .gte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    return { followUps: data ?? [] };
  });




