import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Whitelist of mutable financial tables
const EDITABLE_TABLES = ["payments", "lab_orders", "pharmacy_sales", "appointments"] as const;
type EditableTable = typeof EDITABLE_TABLES[number];

// Per-table allowlist of fields that may be mutated via WhatsApp commands.
// Never allow tenant-scoping or identity columns (hospital_id, patient_id, id, *_by, created_at).
const FIELD_ALLOWLIST: Record<EditableTable, readonly string[]> = {
  payments: ["amount", "method", "status", "reference_no", "txn_id", "notes"],
  lab_orders: ["status", "notes", "priority"],
  pharmacy_sales: ["payment_method", "discount", "notes", "status"],
  appointments: ["status", "notes", "scheduled_at", "starts_at", "ends_at"],
};

function filterPayload(table: EditableTable, payload: Record<string, any>) {
  const allowed = FIELD_ALLOWLIST[table];
  const out: Record<string, any> = {};
  for (const k of Object.keys(payload || {})) {
    if (allowed.includes(k)) out[k] = payload[k];
  }
  return out;
}

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

/** Parse a WhatsApp-style command string. Supports:
 *   EDIT payments <id> amount=500 method=cash
 *   DELETE payments <id>
 */
function parseCommand(raw: string) {
  const tokens = raw.trim().split(/\s+/);
  if (tokens.length < 3) throw new Error("Invalid command. Use: EDIT|DELETE <table> <id> [field=value ...]");
  const action = tokens[0].toLowerCase();
  if (!["edit", "delete"].includes(action)) throw new Error("Action must be EDIT or DELETE");
  const target_table = tokens[1].toLowerCase();
  if (!EDITABLE_TABLES.includes(target_table as EditableTable)) {
    throw new Error(`Table not editable. Allowed: ${EDITABLE_TABLES.join(", ")}`);
  }
  const target_id = tokens[2];
  if (!/^[0-9a-f-]{36}$/i.test(target_id)) throw new Error("Invalid record id");
  const payload: Record<string, any> = {};
  for (const t of tokens.slice(3)) {
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq);
    const v = t.slice(eq + 1);
    payload[k] = isNaN(Number(v)) ? v : Number(v);
  }
  // Strip any field not in the per-table allowlist (prevents cross-tenant moves, etc.)
  const safePayload = filterPayload(target_table as EditableTable, payload);
  return { action, target_table: target_table as EditableTable, target_id, payload: safePayload };
}

/** Submit a WhatsApp command (web fallback while WhatsApp webhook is wired up). */
export const submitWhatsAppCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slug: z.string().min(1).max(100),
    command: z.string().min(5).max(500),
    senderPhone: z.string().min(5).max(20).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await hospitalIdBySlug(data.slug);
    const role = await assertMember(context.userId, hid);
    if (!["doctor", "owner", "hospital_admin"].includes(role)) {
      throw new Error("Only doctors or admins can issue financial commands");
    }
    const parsed = parseCommand(data.command);
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_commands").insert({
        hospital_id: hid,
        sender_phone: data.senderPhone || "web",
        sender_user_id: context.userId,
        sender_role: role,
        command_raw: data.command,
        action: parsed.action,
        target_table: parsed.target_table,
        target_id: parsed.target_id,
        payload: parsed.payload,
        status: "pending",
      }).select("*").single();
    if (error) throw new Error(error.message);
    return { command: row };
  });

export const listWhatsAppCommands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slug: z.string().min(1).max(100),
    limit: z.number().min(1).max(200).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await hospitalIdBySlug(data.slug);
    await assertMember(context.userId, hid);
    const { data: rows, error } = await supabaseAdmin
      .from("whatsapp_commands").select("*")
      .eq("hospital_id", hid)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return { commands: rows || [] };
  });

export const applyWhatsAppCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slug: z.string().min(1).max(100),
    commandId: z.string().uuid(),
    decision: z.enum(["apply", "reject"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await hospitalIdBySlug(data.slug);
    const role = await assertMember(context.userId, hid);
    if (!["owner", "hospital_admin"].includes(role)) {
      throw new Error("Only admins can apply WhatsApp commands");
    }
    const { data: cmd, error: e0 } = await supabaseAdmin
      .from("whatsapp_commands").select("*").eq("id", data.commandId).eq("hospital_id", hid).single();
    if (e0 || !cmd) throw new Error("Command not found");
    if (cmd.status !== "pending") throw new Error("Command already processed");

    if (data.decision === "reject") {
      const { data: row } = await supabaseAdmin
        .from("whatsapp_commands").update({
          status: "rejected", approved_by: context.userId,
        }).eq("id", cmd.id).select("*").single();
      return { command: row };
    }

    // APPLY
    const table = cmd.target_table as EditableTable;
    if (!cmd.target_id) throw new Error("Command missing target id");
    const targetId = cmd.target_id;
    const { data: before, error: bErr } = await supabaseAdmin
      .from(table).select("*").eq("id", targetId).eq("hospital_id", hid).maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!before) throw new Error("Target record not found");

    let after: any = null;
    try {
      if (cmd.action === "delete") {
        const { error } = await supabaseAdmin.from(table).delete()
          .eq("id", targetId).eq("hospital_id", hid);
        if (error) throw new Error(error.message);
      } else {
        const safePayload = filterPayload(table, (cmd.payload as Record<string, any>) || {});
        const { data: upd, error } = await (supabaseAdmin.from(table) as any)
          .update(safePayload).eq("id", targetId).eq("hospital_id", hid)
          .select("*").single();
        if (error) throw new Error(error.message);
        after = upd;
      }

    } catch (err: any) {
      await supabaseAdmin.from("whatsapp_commands").update({
        status: "failed", approved_by: context.userId, error_message: err.message,
      }).eq("id", cmd.id);
      throw err;
    }

    const { data: row } = await supabaseAdmin.from("whatsapp_commands").update({
      status: "applied", approved_by: context.userId, applied_at: new Date().toISOString(),
    }).eq("id", cmd.id).select("*").single();

    await supabaseAdmin.from("financial_audit_log").insert({
      hospital_id: hid, actor_id: context.userId, actor_role: role,
      source: "whatsapp", action: cmd.action === "delete" ? "delete" : "update",
      table_name: table, record_id: cmd.target_id,
      before_data: before, after_data: after,
      reason: cmd.command_raw, whatsapp_command_id: cmd.id,
    });

    return { command: row };
  });

export const listFinancialAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slug: z.string().min(1).max(100),
    limit: z.number().min(1).max(200).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const hid = await hospitalIdBySlug(data.slug);
    await assertMember(context.userId, hid);
    const { data: rows, error } = await supabaseAdmin
      .from("financial_audit_log").select("*")
      .eq("hospital_id", hid)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return { entries: rows || [] };
  });
