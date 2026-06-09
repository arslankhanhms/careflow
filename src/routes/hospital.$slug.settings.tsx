import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ModulePage } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getHospitalIntegrations,
  saveHospitalIntegrations,
  sendTwilioTest,
} from "@/lib/integrations.functions";

export const Route = createFileRoute("/hospital/$slug/settings")({
  head: () => ({ meta: [{ title: "Settings — MediFlow AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { slug } = Route.useParams();
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [hospitalName, setHospitalName] = useState(slug);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"sms" | "whatsapp" | null>(null);
  const [form, setForm] = useState({
    twilio_account_sid: "",
    twilio_auth_token: "",
    twilio_sms_from: "",
    twilio_whatsapp_from: "",
    sms_enabled: false,
    whatsapp_enabled: false,
  });
  const [lastTest, setLastTest] = useState<{
    at: string | null;
    status: string | null;
    error: string | null;
  }>({ at: null, status: null, error: null });
  const [testTo, setTestTo] = useState("");

  const getIntegrations = useServerFn(getHospitalIntegrations);
  const saveIntegrations = useServerFn(saveHospitalIntegrations);
  const sendTest = useServerFn(sendTwilioTest);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: h } = await supabase
        .from("hospitals")
        .select("id, name")
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled || !h) return;
      setHospitalId(h.id);
      setHospitalName(h.name);
      try {
        const { settings } = await getIntegrations({
          data: { hospitalId: h.id },
        });
        if (cancelled) return;
        setForm({
          twilio_account_sid: settings.twilio_account_sid ?? "",
          twilio_auth_token: settings.twilio_auth_token ?? "",
          twilio_sms_from: settings.twilio_sms_from ?? "",
          twilio_whatsapp_from: settings.twilio_whatsapp_from ?? "",
          sms_enabled: !!settings.sms_enabled,
          whatsapp_enabled: !!settings.whatsapp_enabled,
        });
        setLastTest({
          at: settings.last_test_at ?? null,
          status: settings.last_test_status ?? null,
          error: settings.last_test_error ?? null,
        });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load integrations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, getIntegrations]);

  const onSave = async () => {
    if (!hospitalId) return;
    setSaving(true);
    try {
      await saveIntegrations({ data: { hospitalId, ...form } });
      toast.success("Twilio settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async (channel: "sms" | "whatsapp") => {
    if (!hospitalId) return;
    if (!testTo) {
      toast.error("Enter a phone number to test");
      return;
    }
    setTesting(channel);
    try {
      const res = await sendTest({
        data: { hospitalId, to: testTo, channel },
      });
      if (res.ok) {
        toast.success(`Test ${channel.toUpperCase()} sent`);
        setLastTest({
          at: new Date().toISOString(),
          status: "success",
          error: null,
        });
      } else {
        const msg = res.error || res.skipped || "Failed";
        toast.error(`Test failed: ${msg}`);
        setLastTest({
          at: new Date().toISOString(),
          status: res.skipped || "failed",
          error: res.error ?? null,
        });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Test failed");
    } finally {
      setTesting(null);
    }
  };

  return (
    <ModulePage
      title="Hospital settings"
      subtitle="Branding, security, integrations"
      search={false}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Workspace</h3>
          <div className="space-y-3">
            <div>
              <Label>Hospital name</Label>
              <Input defaultValue={hospitalName} readOnly />
            </div>
            <div>
              <Label>Slug</Label>
              <Input defaultValue={slug} readOnly />
            </div>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                Twilio (SMS & WhatsApp notifications)
              </h3>
              <p className="text-xs text-muted-foreground">
                Use your own Twilio account. Credentials are stored privately for
                this hospital only. Get them from{" "}
                <a
                  className="underline"
                  href="https://console.twilio.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  console.twilio.com
                </a>
                .
              </p>
            </div>
            {lastTest.status && (
              <Badge
                variant={lastTest.status === "success" ? "default" : "destructive"}
              >
                Last test: {lastTest.status}
              </Badge>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Account SID</Label>
                <Input
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={form.twilio_account_sid}
                  onChange={(e) =>
                    setForm({ ...form, twilio_account_sid: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Auth Token</Label>
                <Input
                  type="password"
                  placeholder="••••••••••••••••••••"
                  value={form.twilio_auth_token}
                  onChange={(e) =>
                    setForm({ ...form, twilio_auth_token: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>SMS sender number</Label>
                <Input
                  placeholder="+1XXXXXXXXXX"
                  value={form.twilio_sms_from}
                  onChange={(e) =>
                    setForm({ ...form, twilio_sms_from: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>WhatsApp sender number</Label>
                <Input
                  placeholder="+14155238886 (Twilio sandbox or your approved sender)"
                  value={form.twilio_whatsapp_from}
                  onChange={(e) =>
                    setForm({ ...form, twilio_whatsapp_from: e.target.value })
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Enable SMS</p>
                  <p className="text-xs text-muted-foreground">
                    Send appointment & lab updates via SMS
                  </p>
                </div>
                <Switch
                  checked={form.sms_enabled}
                  onCheckedChange={(v) => setForm({ ...form, sms_enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Enable WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    Send appointment & lab updates via WhatsApp
                  </p>
                </div>
                <Switch
                  checked={form.whatsapp_enabled}
                  onCheckedChange={(v) =>
                    setForm({ ...form, whatsapp_enabled: v })
                  }
                />
              </div>

              <div className="md:col-span-2 flex flex-wrap items-end gap-3 border-t pt-4">
                <div className="flex-1 min-w-[200px]">
                  <Label>Send test to</Label>
                  <Input
                    placeholder="+15558675310"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={testing !== null}
                  onClick={() => onTest("sms")}
                >
                  {testing === "sms" ? "Sending…" : "Test SMS"}
                </Button>
                <Button
                  variant="outline"
                  disabled={testing !== null}
                  onClick={() => onTest("whatsapp")}
                >
                  {testing === "whatsapp" ? "Sending…" : "Test WhatsApp"}
                </Button>
                <Button
                  className="bg-gradient-brand text-primary-foreground hover:opacity-95"
                  disabled={saving}
                  onClick={onSave}
                >
                  {saving ? "Saving…" : "Save settings"}
                </Button>
              </div>
              {lastTest.error && (
                <p className="md:col-span-2 text-xs text-destructive">
                  {lastTest.error}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </ModulePage>
  );
}
