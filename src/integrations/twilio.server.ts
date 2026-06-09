// Server-only Twilio helper. Reads per-hospital credentials from
// hospital_integrations and calls Twilio REST API directly.
// Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Channel = "sms" | "whatsapp";

export interface TwilioCreds {
  account_sid: string;
  auth_token: string;
  sms_from: string | null;
  whatsapp_from: string | null;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
}

export async function getHospitalTwilio(
  hospitalId: string,
): Promise<TwilioCreds | null> {
  const { data } = await supabaseAdmin
    .from("hospital_integrations")
    .select(
      "twilio_account_sid, twilio_auth_token, twilio_sms_from, twilio_whatsapp_from, sms_enabled, whatsapp_enabled",
    )
    .eq("hospital_id", hospitalId)
    .maybeSingle();
  if (!data || !data.twilio_account_sid || !data.twilio_auth_token) return null;
  return {
    account_sid: data.twilio_account_sid,
    auth_token: data.twilio_auth_token,
    sms_from: data.twilio_sms_from,
    whatsapp_from: data.twilio_whatsapp_from,
    sms_enabled: !!data.sms_enabled,
    whatsapp_enabled: !!data.whatsapp_enabled,
  };
}

function normalizeTo(to: string, channel: Channel): string {
  const trimmed = to.trim();
  if (channel === "whatsapp") {
    return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
  }
  return trimmed;
}

function normalizeFrom(from: string, channel: Channel): string {
  if (channel === "whatsapp") {
    return from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  }
  return from;
}

export async function sendTwilioMessage(opts: {
  hospitalId: string;
  to: string;
  body: string;
  channel: Channel;
}): Promise<{ ok: boolean; sid?: string; error?: string; skipped?: string }> {
  const creds = await getHospitalTwilio(opts.hospitalId);
  if (!creds) return { ok: false, skipped: "no_credentials" };
  const enabled =
    opts.channel === "sms" ? creds.sms_enabled : creds.whatsapp_enabled;
  if (!enabled) return { ok: false, skipped: "channel_disabled" };
  const fromRaw =
    opts.channel === "sms" ? creds.sms_from : creds.whatsapp_from;
  if (!fromRaw) return { ok: false, skipped: "no_from_number" };
  if (!opts.to) return { ok: false, skipped: "no_recipient" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`;
  const auth = Buffer.from(
    `${creds.account_sid}:${creds.auth_token}`,
  ).toString("base64");
  const body = new URLSearchParams({
    To: normalizeTo(opts.to, opts.channel),
    From: normalizeFrom(fromRaw, opts.channel),
    Body: opts.body.slice(0, 1500),
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: json?.message || `Twilio error ${res.status}`,
      };
    }
    return { ok: true, sid: json?.sid };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

/**
 * Fire-and-forget fanout: tries WhatsApp first then SMS (whichever is
 * enabled). Never throws — failure is silent so callers don't break.
 */
export async function notifyPatientByChannels(opts: {
  hospitalId: string;
  phone: string | null | undefined;
  message: string;
}): Promise<void> {
  if (!opts.phone) return;
  try {
    const creds = await getHospitalTwilio(opts.hospitalId);
    if (!creds) return;
    if (creds.whatsapp_enabled && creds.whatsapp_from) {
      await sendTwilioMessage({
        hospitalId: opts.hospitalId,
        to: opts.phone,
        body: opts.message,
        channel: "whatsapp",
      });
    }
    if (creds.sms_enabled && creds.sms_from) {
      await sendTwilioMessage({
        hospitalId: opts.hospitalId,
        to: opts.phone,
        body: opts.message,
        channel: "sms",
      });
    }
  } catch {
    // silent
  }
}
