import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** List staff in the same hospital (for chat picker) */
export const listHospitalContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hospitalSlug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: hosp } = await supabase.from("hospitals").select("id").eq("slug", data.hospitalSlug).maybeSingle();
    if (!hosp) throw new Error("Hospital not found");
    // Verify caller belongs
    const { data: myRole } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("hospital_id", hosp.id).limit(1);
    if (!myRole?.length) throw new Error("Not a member of this hospital");

    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id, role").eq("hospital_id", hosp.id);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id).filter((u: string) => u !== userId)));
    if (!ids.length) return { hospitalId: hosp.id, contacts: [] };

    const { data: profs } = await supabaseAdmin
      .from("profiles").select("user_id, display_name, email, specialization, department, avatar_url, photo_url")
      .in("user_id", ids);

    // Get last message + unread count per contact
    const { data: lastMsgs } = await supabaseAdmin
      .from("messages")
      .select("sender_id, recipient_id, body, created_at, read_at")
      .eq("hospital_id", hosp.id)
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(500);

    const byContact = new Map<string, { last: any; unread: number }>();
    for (const m of lastMsgs ?? []) {
      const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
      const entry = byContact.get(other) ?? { last: null, unread: 0 };
      if (!entry.last) entry.last = m;
      if (m.recipient_id === userId && !m.read_at) entry.unread += 1;
      byContact.set(other, entry);
    }

    const contacts = (profs ?? []).map((p: any) => {
      const r = (roles ?? []).find((x: any) => x.user_id === p.user_id);
      const meta = byContact.get(p.user_id);
      return {
        userId: p.user_id,
        name: p.display_name || p.email || "Staff",
        email: p.email,
        role: r?.role ?? "staff",
        specialization: p.specialization,
        department: p.department,
        avatar: p.avatar_url || p.photo_url || null,
        lastMessage: meta?.last?.body ?? null,
        lastAt: meta?.last?.created_at ?? null,
        unread: meta?.unread ?? 0,
      };
    }).sort((a, b) => {
      if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return a.name.localeCompare(b.name);
    });

    return { hospitalId: hosp.id, contacts };
  });

/** Fetch conversation between caller and otherUserId in a hospital */
export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      hospitalId: z.string().uuid(),
      otherUserId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const limit = data.limit ?? 100;
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, attachment_url, created_at, delivered_at, read_at")
      .eq("hospital_id", data.hospitalId)
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${data.otherUserId}),and(sender_id.eq.${data.otherUserId},recipient_id.eq.${userId})`)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);

    // Mark incoming as delivered + read
    const toUpdate = (rows ?? []).filter((m: any) => m.recipient_id === userId && (!m.read_at || !m.delivered_at)).map((m: any) => m.id);
    if (toUpdate.length) {
      const now = new Date().toISOString();
      await supabase.from("messages").update({ delivered_at: now, read_at: now }).in("id", toUpdate);
    }
    return { messages: rows ?? [] };
  });

/** Send a message */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      hospitalId: z.string().uuid(),
      recipientId: z.string().uuid(),
      body: z.string().trim().max(4000).optional().default(""),
      attachmentUrl: z.string().url().max(1000).optional(),
    }).refine((v) => (v.body && v.body.trim().length > 0) || !!v.attachmentUrl, {
      message: "Message body or attachment is required",
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("messages")
      .insert({
        hospital_id: data.hospitalId,
        sender_id: userId,
        recipient_id: data.recipientId,
        body: data.body || null,
        attachment_url: data.attachmentUrl ?? null,
      })
      .select("id, sender_id, recipient_id, body, attachment_url, created_at, delivered_at, read_at")
      .single();
    if (error) throw new Error(error.message);

    // Push a notification to the recipient so the bell pings
    const { data: senderProf } = await supabaseAdmin
      .from("profiles").select("display_name, email").eq("user_id", userId).maybeSingle();
    const senderName = (senderProf as any)?.display_name || (senderProf as any)?.email || "New message";
    const preview = data.body
      ? data.body.length > 80 ? data.body.slice(0, 80) + "…" : data.body
      : data.attachmentUrl ? "Sent an attachment" : "";
    await supabaseAdmin.from("notifications").insert({
      user_id: data.recipientId,
      hospital_id: data.hospitalId,
      type: "message.new",
      title: senderName,
      body: preview,
      data: { message_id: row.id, sender_id: userId },
    });

    return { message: row };
  });
