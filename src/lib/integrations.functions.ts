import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTwilioMessage } from "@/integrations/twilio.server";

async function assertAdmin(
  supabase: any,
  userId: string,
  hospitalId: string,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("hospital_id", hospitalId)
    .eq("role", "hospital_admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not authorized");
}

export const getHospitalIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ hospitalId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.hospitalId);
    const { data: row } = await context.supabase
      .from("hospital_integrations")
      .select("*")
      .eq("hospital_id", data.hospitalId)
      .maybeSingle();
    return {
      settings: row ?? {
        hospital_id: data.hospitalId,
        twilio_account_sid: "",
        twilio_auth_token: "",
        twilio_sms_from: "",
        twilio_whatsapp_from: "",
        sms_enabled: false,
        whatsapp_enabled: false,
        last_test_at: null,
        last_test_status: null,
        last_test_error: null,
      },
    };
  });

export const saveHospitalIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        hospitalId: z.string().uuid(),
        twilio_account_sid: z.string().trim().max(100).optional().default(""),
        twilio_auth_token: z.string().trim().max(200).optional().default(""),
        twilio_sms_from: z.string().trim().max(40).optional().default(""),
        twilio_whatsapp_from: z.string().trim().max(60).optional().default(""),
        sms_enabled: z.boolean().optional().default(false),
        whatsapp_enabled: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.hospitalId);
    const payload = {
      hospital_id: data.hospitalId,
      twilio_account_sid: data.twilio_account_sid || null,
      twilio_auth_token: data.twilio_auth_token || null,
      twilio_sms_from: data.twilio_sms_from || null,
      twilio_whatsapp_from: data.twilio_whatsapp_from || null,
      sms_enabled: data.sms_enabled,
      whatsapp_enabled: data.whatsapp_enabled,
    };
    const { error } = await supabaseAdmin
      .from("hospital_integrations")
      .upsert(payload, { onConflict: "hospital_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTwilioTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        hospitalId: z.string().uuid(),
        to: z.string().trim().min(5).max(40),
        channel: z.enum(["sms", "whatsapp"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.hospitalId);
    const result = await sendTwilioMessage({
      hospitalId: data.hospitalId,
      to: data.to,
      body: "Test message from your hospital — Twilio is connected.",
      channel: data.channel,
    });
    await supabaseAdmin
      .from("hospital_integrations")
      .update({
        last_test_at: new Date().toISOString(),
        last_test_status: result.ok ? "success" : result.skipped || "failed",
        last_test_error: result.error || null,
      })
      .eq("hospital_id", data.hospitalId);
    return result;
  });
