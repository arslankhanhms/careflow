import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Public list of countries (distinct, hospitals only). */
export const listCountries = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("hospitals")
    .select("country")
    .eq("status", "active")
    .not("country", "is", null);
  if (error) throw new Error(error.message);
  const set = new Set((data ?? []).map((h: any) => (h.country as string).trim()).filter(Boolean));
  return Array.from(set).sort();
});

/** Public cities by country. */
export const listCities = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ country: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("hospitals")
      .select("city")
      .eq("status", "active")
      .eq("country", data.country)
      .not("city", "is", null);
    if (error) throw new Error(error.message);
    const set = new Set((rows ?? []).map((r: any) => (r.city as string).trim()).filter(Boolean));
    return Array.from(set).sort();
  });

/** Public hospitals list by city. Safe column projection. */
export const listHospitals = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ country: z.string().min(1).max(100), city: z.string().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("hospitals")
      .select("id, slug, name, city, country, address, phone, brand_color, logo_url")
      .eq("status", "active")
      .eq("country", data.country)
      .eq("city", data.city)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Public list of specialties available in a given city (across all active hospitals). */
export const listSpecialtiesByCity = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ country: z.string().min(1).max(100), city: z.string().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: hosps, error: hErr } = await supabaseAdmin
      .from("hospitals")
      .select("id")
      .eq("status", "active")
      .eq("country", data.country)
      .eq("city", data.city);
    if (hErr) throw new Error(hErr.message);
    const ids = (hosps ?? []).map((h: any) => h.id);
    if (!ids.length) return [];
    const { data: docs, error } = await supabaseAdmin
      .from("profiles")
      .select("specialization")
      .in("hospital_id", ids)
      .eq("is_doctor", true)
      .not("specialization", "is", null);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const d of docs ?? []) {
      const s = (d as any).specialization?.trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort();
  });

/** Public list of doctors in a city filtered by specialty, returned with hospital info. */
export const listDoctorsByCitySpecialty = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      country: z.string().min(1).max(100),
      city: z.string().min(1).max(100),
      specialty: z.string().min(1).max(100),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: hosps, error: hErr } = await supabaseAdmin
      .from("hospitals")
      .select("id, slug, name, city, country")
      .eq("status", "active")
      .eq("country", data.country)
      .eq("city", data.city);
    if (hErr) throw new Error(hErr.message);
    if (!hosps?.length) return [];
    const byId = new Map<string, any>(hosps.map((h: any) => [h.id, h]));
    const { data: docs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, hospital_id, display_name, specialization, department, photo_url, consultation_fee, experience_years, rating, working_days, working_hours, slot_duration_min, max_patients_per_day, phone")
      .in("hospital_id", hosps.map((h: any) => h.id))
      .eq("is_doctor", true)
      .ilike("specialization", data.specialty)
      .order("display_name");
    if (error) throw new Error(error.message);
    return (docs ?? []).map((d: any) => ({ ...d, hospital: byId.get(d.hospital_id) ?? null }));
  });

/** Public hospital lookup by slug (used on doctor profile page). */
export const getHospitalBySlug = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("hospitals")
      .select("id, slug, name, city, country, address, phone, brand_color, logo_url")
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

/** Public list of doctors at a hospital. Safe column projection. */
export const listDoctors = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ hospitalSlug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { data: hosp, error: hErr } = await supabaseAdmin
      .from("hospitals").select("id").eq("slug", data.hospitalSlug).maybeSingle();
    if (hErr) throw new Error(hErr.message);
    if (!hosp) return [];
    const { data: docs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, display_name, specialization, department, photo_url, bio, consultation_fee, experience_years, rating, working_days, working_hours, slot_duration_min, max_patients_per_day, phone")
      .eq("hospital_id", hosp.id)
      .eq("is_doctor", true)
      .order("display_name");
    if (error) throw new Error(error.message);
    return docs ?? [];
  });

/** Get one doctor by id (public). */
export const getDoctor = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ doctorId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: doc, error } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, hospital_id, display_name, specialization, department, photo_url, bio, consultation_fee, experience_years, rating, working_days, working_hours, slot_duration_min, max_patients_per_day, phone")
      .eq("id", data.doctorId)
      .eq("is_doctor", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return null;
    const { data: hosp } = await supabaseAdmin
      .from("hospitals")
      .select("id, slug, name, city, country, brand_color")
      .eq("id", doc.hospital_id!)
      .maybeSingle();
    return { ...doc, hospital: hosp };
  });

/** Generate available slots for a doctor on a date. Returns up to N upcoming days if requested. */
export const getDoctorAvailability = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      doctorId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: doc, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id, hospital_id, working_days, working_hours, slot_duration_min, max_patients_per_day")
      .eq("id", data.doctorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return { slots: [], dayOff: true, full: false, nextAvailable: null as string | null, booked: 0, cap: 0, remaining: 0 };

    const wd = (doc.working_days ?? []) as string[];
    const dayKey = ["sun","mon","tue","wed","thu","fri","sat"][new Date(data.date + "T00:00:00").getUTCDay()];
    const capDoc = doc.max_patients_per_day ?? 50;
    if (!wd.includes(dayKey)) {
      return { slots: [], dayOff: true, full: false, nextAvailable: nextWorkingDate(data.date, wd), booked: 0, cap: capDoc, remaining: capDoc };
    }

    const wh = (doc.working_hours ?? { start: "09:00", end: "17:00" }) as { start: string; end: string };
    const dur = doc.slot_duration_min ?? 15;
    const cap = doc.max_patients_per_day ?? 50;

    // Existing booked slots that day
    const dayStart = new Date(data.date + "T00:00:00Z").toISOString();
    const dayEnd = new Date(data.date + "T23:59:59Z").toISOString();
    const { data: appts } = await supabaseAdmin
      .from("appointments")
      .select("slot_start, status")
      .eq("doctor_id", doc.user_id!)
      .gte("slot_start", dayStart)
      .lte("slot_start", dayEnd)
      .neq("status", "cancelled");

    const taken = new Set((appts ?? []).map((a: any) => new Date(a.slot_start).getTime()).filter(Number.isFinite));
    const booked = appts?.length ?? 0;

    const slots: { start: string; end: string; taken: boolean; past: boolean }[] = [];
    const [sh, sm] = wh.start.split(":").map(Number);
    const [eh, em] = wh.end.split(":").map(Number);
    const cursor = new Date(data.date + `T${pad(sh)}:${pad(sm)}:00`);
    const end = new Date(data.date + `T${pad(eh)}:${pad(em)}:00`);
    const now = Date.now();
    while (cursor < end) {
      const s = new Date(cursor);
      const e = new Date(cursor.getTime() + dur * 60_000);
      const iso = s.toISOString();
      slots.push({ start: iso, end: e.toISOString(), taken: taken.has(s.getTime()), past: s.getTime() <= now });
      cursor.setMinutes(cursor.getMinutes() + dur);
    }
    const full = booked >= cap;
    const availableLeft = slots.filter((s) => !s.taken && !s.past).length;
    const dayEnded = slots.length > 0 && availableLeft === 0 && slots.every((s) => s.past || s.taken);
    return {
      slots, dayOff: false, full, dayEnded,
      workingHoursEnd: wh.end,
      nextAvailable: (full || dayEnded) ? nextWorkingDate(data.date, wd) : null,
      booked, cap, remaining: Math.max(0, cap - booked),
    };
  });

function pad(n: number) { return String(n).padStart(2, "0"); }
function nextWorkingDate(from: string, workingDays: string[]) {
  const d = new Date(from + "T00:00:00");
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    const k = ["sun","mon","tue","wed","thu","fri","sat"][d.getUTCDay()];
    if (workingDays.includes(k)) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Public free-text search for doctors by name (across all active hospitals). */
export const searchDoctorsByName = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { data: hosps } = await supabaseAdmin
      .from("hospitals")
      .select("id, slug, name, city, country")
      .eq("status", "active");
    const byId = new Map<string, any>((hosps ?? []).map((h: any) => [h.id, h]));
    if (!byId.size) return [];
    const { data: docs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, hospital_id, display_name, specialization, department, photo_url, consultation_fee, experience_years, rating, working_days, working_hours, slot_duration_min, max_patients_per_day, phone")
      .in("hospital_id", Array.from(byId.keys()))
      .eq("is_doctor", true)
      .ilike("display_name", `%${data.q}%`)
      .order("display_name")
      .limit(40);
    if (error) throw new Error(error.message);
    return (docs ?? []).map((d: any) => ({ ...d, hospital: byId.get(d.hospital_id) ?? null }));
  });
