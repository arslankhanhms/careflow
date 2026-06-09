import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAGE_SIZE = 20;

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      before: z.string().datetime().optional(), // ISO timestamp cursor
      limit: z.number().int().min(1).max(50).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const limit = data.limit ?? PAGE_SIZE;

    let q = supabase
      .from("notifications")
      .select("id, type, title, body, data, read_at, delivered_at, created_at, hospital_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (data.before) q = q.lt("created_at", data.before);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const items = (rows ?? []).slice(0, limit);
    const hasMore = (rows ?? []).length > limit;
    const nextCursor = hasMore ? items[items.length - 1]?.created_at ?? null : null;

    // Mark fetched items as delivered (read receipt: "delivered" tick)
    const toDeliver = items.filter((n: any) => !n.delivered_at).map((n: any) => n.id);
    if (toDeliver.length) {
      const now = new Date().toISOString();
      await supabase.from("notifications").update({ delivered_at: now }).in("id", toDeliver);
      for (const n of items as any[]) if (toDeliver.includes(n.id)) n.delivered_at = now;
    }

    // Unread count uses head:true to avoid loading rows
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    return { items, unread: count ?? 0, nextCursor, hasMore };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    if (data.all) {
      const { error } = await supabase.from("notifications").update({ read_at: now, delivered_at: now }).is("read_at", null).eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else if (data.id) {
      const { error } = await supabase.from("notifications").update({ read_at: now, delivered_at: now }).eq("id", data.id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
