import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ExternalLink, Loader2, Copy } from "lucide-react";
import { StatusBadge } from "./master_admin.dashboard";
import { toast } from "sonner";
import { createHospitalWithAdmin, listHospitalsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/master_admin/hospitals")({ component: HospitalsPage });

function HospitalsPage() {
  const fnList = useServerFn(listHospitalsAdmin);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string; slug: string } | null>(null);

  const refresh = () => {
    setLoading(true);
    fnList()
      .then((r: any) => setRows(r.hospitals))
      .catch((e: any) => toast.error(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(
    () => rows.filter((h) => `${h.name} ${h.city} ${h.slug}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  );

  return (
    <>
      <AppTopbar
        title="Hospitals"
        subtitle="Onboard, manage and monitor every tenant"
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-brand text-primary-foreground hover:opacity-95">
                <Plus className="mr-1.5 h-4 w-4" /> Onboard hospital
              </Button>
            </DialogTrigger>
            <OnboardDialog
              onCreated={(info) => { setOpen(false); setCreatedInfo(info); refresh(); }}
            />
          </Dialog>
        }
      />
      <div className="space-y-4 p-6">
        <Card className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name, city, slug…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Hospital</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Doctors</th>
                  <th className="px-4 py-3 font-medium">Patients</th>
                  <th className="px-4 py-3 font-medium">AI credits</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="p-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                )}
                {!loading && filtered.map((h) => (
                  <tr key={h.id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{h.name}</p>
                      <p className="text-xs text-muted-foreground">{h.city} · /hospital/{h.slug}</p>
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{h.plan}</Badge></td>
                    <td className="px-4 py-3">{h.doctors}</td>
                    <td className="px-4 py-3">{h.patients.toLocaleString()}</td>
                    <td className="px-4 py-3">{(h.ai_credits_used ?? 0).toLocaleString()} / {(h.ai_credits_monthly ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3"><StatusBadge status={h.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/hospital/$slug" params={{ slug: h.slug }}>
                          Open <ExternalLink className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">No hospitals yet — onboard your first tenant.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Dialog open={!!createdInfo} onOpenChange={(o) => !o && setCreatedInfo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Hospital created</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Share these credentials with the hospital admin. They can sign in at <span className="font-mono">/login</span> and manage their hospital from <span className="font-mono">/hospital/{createdInfo?.slug}</span>.</p>
          <div className="space-y-2 rounded-md border bg-secondary/30 p-3 text-sm">
            <Row label="Email" value={createdInfo?.email ?? ""} />
            <Row label="Temporary password" value={createdInfo?.password ?? ""} />
          </div>
          <DialogFooter><Button onClick={() => setCreatedInfo(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono">{value}
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}>
          <Copy className="h-3 w-3" />
        </Button>
      </span>
    </div>
  );
}

function OnboardDialog({ onCreated }: { onCreated: (info: { email: string; password: string; slug: string }) => void }) {
  const fnCreate = useServerFn(createHospitalWithAdmin);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Pakistan");
  const [plan, setPlan] = useState<"starter" | "pro" | "enterprise">("pro");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const autoSlug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const genPwd = () => Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6) + "-" + Math.floor(10 + Math.random()*89);

  const valid = name && slug && city && adminName && adminEmail && adminPassword.length >= 8;

  const submit = async () => {
    setBusy(true);
    try {
      await fnCreate({ data: { name, slug, city, country, plan, adminName, adminEmail, adminPassword } });
      toast.success(`${name} onboarded`);
      onCreated({ email: adminEmail, password: adminPassword, slug });
    } catch (e: any) {
      toast.error(e?.message || "Failed to create hospital");
    } finally { setBusy(false); }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Onboard a new hospital</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Hospital name</Label>
          <Input value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(autoSlug(e.target.value)); }} placeholder="City Hospital" />
        </div>
        <div className="space-y-1.5">
          <Label>Slug</Label>
          <Input value={slug} onChange={(e) => setSlug(autoSlug(e.target.value))} placeholder="city-hospital" />
        </div>
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Select value={plan} onValueChange={(v) => setPlan(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Pakistan" />
        </div>

        <div className="sm:col-span-2 mt-2 rounded-md border bg-secondary/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">First hospital admin</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full name</Label>
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Dr. Asif Khan" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@hospital.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Temp password</Label>
              <div className="flex gap-2">
                <Input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="min 8 chars" />
                <Button type="button" size="sm" variant="outline" onClick={() => setAdminPassword(genPwd())}>Generate</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button className="bg-gradient-brand text-primary-foreground hover:opacity-95" disabled={!valid || busy} onClick={submit}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create hospital + admin
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
