import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ModulePage, NewBtn, StatCard, StatusBadge } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listBloodBank, recordBloodDonation, recordBloodUsage } from "@/lib/blood.functions";
import { Loader2, Droplet, Database } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

const GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const PRODUCTS: { key: string; label: string }[] = [
  { key: "whole_blood", label: "Whole Blood" },
  { key: "plasma",      label: "Plasma" },
  { key: "rbc",         label: "RBCs" },
  { key: "wbc",         label: "WBCs" },
  { key: "platelets",   label: "Platelets" },
];
const PRODUCT_LABEL: Record<string, string> = Object.fromEntries(PRODUCTS.map((p) => [p.key, p.label]));

export const Route = createFileRoute("/hospital/$slug/blood")({
  head: () => ({ meta: [{ title: "Blood Bank — MediFlow AI" }] }),
  component: BloodPage,
});

function tone(units: number, low: number, crit: number): "ok" | "warn" | "danger" {
  if (units <= crit) return "danger";
  if (units <= low) return "warn";
  return "ok";
}
function label(t: "ok" | "warn" | "danger") { return t === "ok" ? "OK" : t === "warn" ? "Low" : "Critical"; }

function BloodPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listBloodBank);
  const record = useServerFn(recordBloodDonation);
  const useFn = useServerFn(recordBloodUsage);
  const [open, setOpen] = useState(false);
  const [openUse, setOpenUse] = useState(false);

  const q = useQuery({
    queryKey: ["blood", slug],
    queryFn: () => list({ data: { slug } }),
    enabled: !!user,
  });
  const recMut = useMutation({
    mutationFn: (v: any) => record({ data: { slug, ...v } }),
    onSuccess: () => { toast.success("Donation recorded"); setOpen(false); qc.invalidateQueries({ queryKey: ["blood", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  // inventory adjust removed per request — stock is changed via donations/usages only.

  const inv = q.data?.inventory ?? [];
  const total = inv.reduce((s: number, r: any) => s + Number(r.units ?? 0), 0);
  const critical = inv.filter((r: any) => r.units <= r.critical_level).length;
  const low = inv.filter((r: any) => r.units > r.critical_level && r.units <= r.low_level).length;
  const donors = q.data?.donors ?? [];

  const usages = q.data?.usages ?? [];
  const useMut = useMutation({
    mutationFn: (v: any) => useFn({ data: { slug, ...v } }),
    onSuccess: () => { toast.success("Blood usage recorded"); setOpenUse(false); qc.invalidateQueries({ queryKey: ["blood", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <ModulePage title="Blood Bank" subtitle="Live inventory · Lovable Cloud" actions={
      <div className="flex gap-2">
        <Dialog open={openUse} onOpenChange={setOpenUse}>
          <DialogTrigger asChild><Button variant="outline">Record usage</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record blood usage</DialogTitle></DialogHeader>
            <UsageForm loading={useMut.isPending} onSubmit={(d) => useMut.mutate(d)} />
            <DialogFooter />
          </DialogContent>
        </Dialog>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><div><NewBtn label="Record donation" /></div></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record a blood donation</DialogTitle></DialogHeader>
            <DonationForm loading={recMut.isPending} onSubmit={(d) => recMut.mutate(d)} />
            <DialogFooter />
          </DialogContent>
        </Dialog>
      </div>
    }>
      {!user && (
        <Card className="flex items-center justify-between border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-warning-foreground" />
            <div><p className="text-sm font-semibold">Sign in required</p>
              <p className="text-xs text-muted-foreground">Blood bank data is tenant-scoped.</p></div>
          </div>
          <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total units" value={String(total)} />
        <StatCard label="Critical types" value={String(critical)} tone="destructive" />
        <StatCard label="Low types" value={String(low)} tone="warning" />
        <StatCard label="Donations this week" value={String(q.data?.donations_this_week ?? 0)} tone="info" />
      </div>

      {q.isLoading && <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>}
      {q.error && <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>}

      {inv.length > 0 && (
        <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-8">
          {inv.map((b: any) => {
            const t = tone(b.units, b.low_level, b.critical_level);
            return (
              <Card key={b.id} className="p-5 text-center">
                <p className="font-display text-3xl font-bold text-primary">{b.blood_group}</p>
                <p className="mt-1 text-2xl font-semibold">{b.units}</p>
                <p className="text-[11px] text-muted-foreground">units</p>
                <div className="mt-2"><StatusBadge status={label(t)} tone={t} /></div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-0">
        <div className="border-b p-4">
          <p className="text-sm font-semibold">Recent donations</p>
          <p className="text-xs text-muted-foreground">Last 50 records</p>
        </div>
        {donors.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No donations recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Donor</th>
                <th className="px-4 py-3 font-medium">CNIC</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Group</th>
                <th className="px-4 py-3 font-medium">Units</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr></thead>
              <tbody>{donors.map((d: any) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium">{d.donor_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.cnic ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.phone ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.blood_group} tone="info" /></td>
                  <td className="px-4 py-3 font-semibold">{d.units}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(d.donated_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b p-4">
          <p className="text-sm font-semibold">Blood usage</p>
          <p className="text-xs text-muted-foreground">Which patient received how many units</p>
        </div>
        {usages.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No usage recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">MRN</th>
                <th className="px-4 py-3 font-medium">Group</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Units</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr></thead>
              <tbody>{usages.map((u: any) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium">{u.patient_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{u.patient_mrn ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={u.blood_group} tone="info" /></td>
                  <td className="px-4 py-3 text-xs capitalize">{PRODUCT_LABEL[u.product ?? "whole_blood"] ?? u.product}</td>
                  <td className="px-4 py-3 font-semibold">{u.units}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.reason ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(u.used_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </ModulePage>
  );
}

function UsageForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [v, setV] = useState({ patient_name: "", patient_mrn: "", blood_group: "O+", product: "whole_blood", units: 1, reason: "", notes: "" });
  return (
    <div className="space-y-3">
      <div><Label>Patient name *</Label><Input value={v.patient_name} onChange={(e) => setV({ ...v, patient_name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>MRN</Label><Input value={v.patient_mrn} onChange={(e) => setV({ ...v, patient_mrn: e.target.value })} /></div>
        <div><Label>Blood group</Label>
          <Select value={v.blood_group} onValueChange={(g) => setV({ ...v, blood_group: g })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Product *</Label>
          <Select value={v.product} onValueChange={(p) => setV({ ...v, product: p })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRODUCTS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Units *</Label><Input type="number" min={1} max={20} value={v.units} onChange={(e) => setV({ ...v, units: Math.max(1, Number(e.target.value)) })} /></div>
      </div>
      <div><Label>Reason</Label><Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. surgery, anemia" /></div>
      <div><Label>Notes</Label><Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      {v.product === "whole_blood" && (
        <p className="text-[11px] text-muted-foreground">Stock will be checked against {v.blood_group} inventory before saving.</p>
      )}
      <Button className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95"
        disabled={loading || !v.patient_name} onClick={() => onSubmit(v)}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Droplet className="mr-2 h-4 w-4" />} Record usage
      </Button>
    </div>
  );
}

function DonationForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [v, setV] = useState({ donor_name: "", cnic: "", phone: "", blood_group: "O+", units: 1, notes: "" });
  return (
    <div className="space-y-3">
      <div><Label>Donor name *</Label><Input value={v.donor_name} onChange={(e) => setV({ ...v, donor_name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>CNIC</Label><Input value={v.cnic} onChange={(e) => setV({ ...v, cnic: e.target.value })} /></div>
        <div><Label>Phone</Label><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Blood group</Label>
          <Select value={v.blood_group} onValueChange={(g) => setV({ ...v, blood_group: g })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Units *</Label><Input type="number" min={1} max={10} value={v.units} onChange={(e) => setV({ ...v, units: Math.max(1, Number(e.target.value)) })} /></div>
      </div>
      <div><Label>Notes</Label><Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      <Button className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95"
        disabled={loading || !v.donor_name} onClick={() => onSubmit(v)}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Droplet className="mr-2 h-4 w-4" />} Record donation
      </Button>
    </div>
  );
}
