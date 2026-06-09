import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ModulePage, NewBtn, StatCard, StatusBadge } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listPharmacyItems, createPharmacyItem, adjustStock, deletePharmacyItem, lookupPharmacyPatient, listPendingPrescriptions, dispensePrescription, dispenseAndBill } from "@/lib/pharmacy.functions";
import { PharmacyDashboardTab } from "@/components/pharmacy/pharmacy-dashboard-tab";
import { PharmacyInventoryTab } from "@/components/pharmacy/pharmacy-inventory-tab";
import { PharmacyPosTab } from "@/components/pharmacy/pharmacy-pos-tab";
import { PharmacyPurchasesTab } from "@/components/pharmacy/pharmacy-purchases-tab";
import { PharmacySuppliersTab } from "@/components/pharmacy/pharmacy-suppliers-tab";
import { PharmacyReportsTab } from "@/components/pharmacy/pharmacy-reports-tab";
import { PharmacySettingsTab } from "@/components/pharmacy/pharmacy-settings-tab";

import { Loader2, Pill, Plus, Minus, Trash2, Database, Search, User, CheckCircle2, ClipboardList, LayoutDashboard, Package, ClipboardCheck, ShoppingCart, Truck, Users, BarChart3, Settings as SettingsIcon } from "lucide-react";

import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/hospital/$slug/pharmacy")({
  head: () => ({ meta: [{ title: "Pharmacy — MediFlow AI" }] }),
  component: PharmacyPage,
});

function stockTone(qty: number, reorder: number, expiry?: string | null): "ok" | "warn" | "danger" {
  if (expiry) {
    const days = (new Date(expiry).getTime() - Date.now()) / 86400000;
    if (days < 30) return "danger";
  }
  if (qty <= 0) return "danger";
  if (qty <= reorder) return "warn";
  return "ok";
}
function stockLabel(t: "ok" | "warn" | "danger") {
  return t === "ok" ? "OK" : t === "warn" ? "Low" : "Critical";
}

function PharmacyPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const list = useServerFn(listPharmacyItems);
  const create = useServerFn(createPharmacyItem);
  const adj = useServerFn(adjustStock);
  const del = useServerFn(deletePharmacyItem);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["pharmacy", slug],
    queryFn: () => list({ data: { slug } }),
    enabled: !!user,
  });
  const createMut = useMutation({
    mutationFn: (d: any) => create({ data: d }),
    onSuccess: () => { toast.success("Item added"); setOpen(false); qc.invalidateQueries({ queryKey: ["pharmacy", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const adjMut = useMutation({
    mutationFn: (v: { id: string; delta: number }) => adj({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pharmacy", slug] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["pharmacy", slug] }); },
  });

  const items = q.data?.items ?? [];
  const lowCount = items.filter((m: any) => m.stock_qty <= (m.reorder_level ?? 10) && m.stock_qty > 0).length;
  const expiringSoon = items.filter((m: any) => m.expiry_date && (new Date(m.expiry_date).getTime() - Date.now()) / 86400000 < 30).length;
  const value = items.reduce((s: number, m: any) => s + Number(m.stock_qty) * Number(m.unit_price ?? 0), 0);

  return (
    <ModulePage title="Pharmacy" subtitle="Inventory · Dispense · Analytics" actions={
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><div><NewBtn label="Quick add" /></div></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Add inventory item (legacy)</DialogTitle></DialogHeader>
          <ItemForm loading={createMut.isPending} onSubmit={(d) => createMut.mutate({ slug, ...d })} />
          <DialogFooter />
        </DialogContent>
      </Dialog>
    }>
      {!user && <SignInBanner />}

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard"><LayoutDashboard className="mr-1.5 h-4 w-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="inventory"><Package className="mr-1.5 h-4 w-4" /> Inventory</TabsTrigger>
          <TabsTrigger value="pos"><ShoppingCart className="mr-1.5 h-4 w-4" /> POS</TabsTrigger>
          <TabsTrigger value="dispense"><ClipboardCheck className="mr-1.5 h-4 w-4" /> Dispense</TabsTrigger>
          <TabsTrigger value="purchases"><Truck className="mr-1.5 h-4 w-4" /> Purchases</TabsTrigger>
          <TabsTrigger value="contacts"><Users className="mr-1.5 h-4 w-4" /> Contacts</TabsTrigger>
          <TabsTrigger value="reports"><BarChart3 className="mr-1.5 h-4 w-4" /> Reports</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="mr-1.5 h-4 w-4" /> Settings</TabsTrigger>

        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <PharmacyDashboardTab slug={slug} enabled={!!user} />
        </TabsContent>

        <TabsContent value="inventory">
          <PharmacyInventoryTab slug={slug} enabled={!!user} />
        </TabsContent>

        <TabsContent value="pos">
          <PharmacyPosTab slug={slug} enabled={!!user} />
        </TabsContent>

        <TabsContent value="dispense" className="space-y-4">
          <PatientLookup slug={slug} enabled={!!user} />
          <PendingPrescriptions slug={slug} enabled={!!user} />
        </TabsContent>

        <TabsContent value="purchases">
          <PharmacyPurchasesTab slug={slug} enabled={!!user} />
        </TabsContent>

        <TabsContent value="contacts">
          <PharmacySuppliersTab slug={slug} enabled={!!user} />
        </TabsContent>

        <TabsContent value="reports">
          <PharmacyReportsTab slug={slug} enabled={!!user} />
        </TabsContent>

        <TabsContent value="settings">
          <PharmacySettingsTab slug={slug} enabled={!!user} />
        </TabsContent>

      </Tabs>
    </ModulePage>
  );
}

function ItemForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [v, setV] = useState({
    name: "", sku: "", category: "", manufacturer: "", unit: "tablet",
    stock_qty: 100, reorder_level: 20, unit_price: 0, expiry_date: "",
  });
  return (
    <div className="space-y-3">
      <div><Label>Name *</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Amoxicillin 500mg" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>SKU</Label><Input value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} /></div>
        <div><Label>Category</Label><Input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="Antibiotic" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Unit</Label><Input value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} /></div>
        <div><Label>Manufacturer</Label><Input value={v.manufacturer} onChange={(e) => setV({ ...v, manufacturer: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Stock</Label><Input type="number" value={v.stock_qty} onChange={(e) => setV({ ...v, stock_qty: Number(e.target.value) })} /></div>
        <div><Label>Reorder at</Label><Input type="number" value={v.reorder_level} onChange={(e) => setV({ ...v, reorder_level: Number(e.target.value) })} /></div>
        <div><Label>Unit price</Label><Input type="number" step="0.01" value={v.unit_price} onChange={(e) => setV({ ...v, unit_price: Number(e.target.value) })} /></div>
      </div>
      <div><Label>Expiry date</Label><Input type="date" value={v.expiry_date} onChange={(e) => setV({ ...v, expiry_date: e.target.value })} /></div>
      <Button className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95"
        disabled={loading || !v.name} onClick={() => onSubmit(v)}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pill className="mr-2 h-4 w-4" />} Add to inventory
      </Button>
    </div>
  );
}

function SignInBanner() {
  return (
    <Card className="flex items-center justify-between border-warning/30 bg-warning/10 p-4">
      <div className="flex items-center gap-3">
        <Database className="h-5 w-5 text-warning-foreground" />
        <div><p className="text-sm font-semibold">Sign in required</p>
          <p className="text-xs text-muted-foreground">Inventory is tenant-scoped.</p></div>
      </div>
      <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
    </Card>
  );
}
function Loading() {
  return <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;
}

function PatientLookup({ slug, enabled }: { slug: string; enabled: boolean }) {
  const lookup = useServerFn(lookupPharmacyPatient);
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const res = useQuery({
    queryKey: ["pharm-pt-lookup", slug, submitted],
    queryFn: () => lookup({ data: { slug, query: submitted } }),
    enabled: enabled && submitted.length >= 2,
  });
  const patient = res.data?.patient ?? null;
  const prescriptions = res.data?.prescriptions ?? [];
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Dispense by CNIC / MRN</p>
        <span className="text-xs text-muted-foreground">Patient gives their CNIC or MR number — look it up to see pending prescriptions.</span>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="MR-00001 / PMR-2026-… / 35202-1234567-1 / +92…" />
        <Button type="submit" disabled={q.trim().length < 2}>
          {res.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
        </Button>
      </form>
      {submitted && !res.isFetching && !patient && (
        <p className="text-xs text-muted-foreground">No patient matched “{submitted}”.</p>
      )}
      {patient && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/30 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{patient.first_name} {patient.last_name}</span>
              <Badge variant="outline" className="font-mono text-[10px]">{patient.mrn}</Badge>
              {patient.cnic && <Badge variant="outline" className="font-mono text-[10px]">{patient.cnic}</Badge>}
              {patient.blood_group && <Badge variant="outline">{patient.blood_group}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {patient.phone ?? "—"}
              {Array.isArray(patient.allergies) && patient.allergies.length > 0 && (
                <span className="ml-2 text-warning-foreground">Allergies: {patient.allergies.join(", ")}</span>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent prescriptions (last 60 days)</p>
            {prescriptions.length === 0 ? (
              <p className="rounded-md border bg-secondary/20 p-3 text-xs text-muted-foreground">No prescriptions on file.</p>
            ) : (
              <div className="space-y-2">
                {prescriptions.map((p: any) => (
                  <div key={p.id} className="rounded-md border p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{new Date(p.issued_at).toLocaleString()}</span>
                      {p.diagnosis && <Badge variant="outline">{p.diagnosis}</Badge>}
                    </div>
                    <ul className="space-y-1">
                      {((p.medications as any[]) ?? []).map((m: any, i: number) => (
                        <li key={i} className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{m.name}{m.dose ? ` · ${m.dose}` : ""}</p>
                            <p className="text-xs text-muted-foreground">
                              {[m.frequency, m.duration, m.instructions].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </li>
                      ))}
                      {(!p.medications || (p.medications as any[]).length === 0) && (
                        <li className="text-xs text-muted-foreground">No medications listed.</li>
                      )}
                    </ul>
                    {p.notes && <p className="mt-2 text-xs text-muted-foreground">Notes: {p.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}


function PendingPrescriptions({ slug, enabled }: { slug: string; enabled: boolean }) {
  const list = useServerFn(listPendingPrescriptions);
  const disp = useServerFn(dispensePrescription);
  const dispBill = useServerFn(dispenseAndBill);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["pharm-pending", slug],
    queryFn: () => list({ data: { slug } }),
    enabled,
    refetchInterval: 20000,
  });
  // Realtime: refresh when new prescriptions or dispenses arrive for this hospital
  useEffect(() => {
    if (!enabled) return;
    let ch: any;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      ch = supabase.channel(`pharm-rx-${slug}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions" },
          () => { qc.invalidateQueries({ queryKey: ["pharm-pending", slug] }); toast.message("Prescription list updated"); })
        .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_dispenses" },
          () => qc.invalidateQueries({ queryKey: ["pharm-pending", slug] }))
        .subscribe();
    });
    return () => { if (ch) import("@/integrations/supabase/client").then(({ supabase }) => supabase.removeChannel(ch)); };
  }, [slug, enabled, qc]);
  const dispMut = useMutation({
    mutationFn: (v: { prescriptionId: string; total: number }) => disp({ data: v }),
    onSuccess: () => { toast.success("Marked as dispensed · doctor notified"); qc.invalidateQueries({ queryKey: ["pharm-pending", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const billMut = useMutation({
    mutationFn: (v: { prescriptionId: string }) => dispBill({ data: { slug, prescriptionId: v.prescriptionId, payment_method: "cash" } }),
    onSuccess: (r: any) => {
      if (r?.alreadyDispensed) toast.message("Already dispensed");
      else if (r?.sale) toast.success(`Sale ${r.sale.invoice_no} created · ${r.matched} item(s)${r.unmatched?.length ? ` · ${r.unmatched.length} unmatched` : ""}`);
      else toast.message("Dispensed (no matching medicines in inventory)");
      qc.invalidateQueries({ queryKey: ["pharm-pending", slug] });
      qc.invalidateQueries({ queryKey: ["pharm-reports", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = (q.data?.prescriptions ?? []) as any[];
  const pending = rows.filter((r) => !r.dispense);
  const done = rows.filter((r) => r.dispense);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Prescription tasks</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="border-warning/40 bg-warning/10">{pending.length} pending</Badge>
          <Badge variant="outline" className="border-success/30 bg-success/10">{done.length} dispensed</Badge>
        </div>
      </div>
      {q.isLoading ? <Loading /> : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No prescriptions in the last 14 days.</p>
      ) : (
        <div className="divide-y">
          {[...pending, ...done].map((p) => {
            const meds = (p.medications as any[]) ?? [];
            return (
              <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{p.patient?.first_name} {p.patient?.last_name}</span>
                    {p.patient?.mrn && <Badge variant="outline" className="font-mono text-[10px]">{p.patient.mrn}</Badge>}
                    {p.patient?.cnic && <Badge variant="outline" className="font-mono text-[10px]">{p.patient.cnic}</Badge>}
                    {p.doctor?.display_name && <span className="text-xs text-muted-foreground">· Dr. {p.doctor.display_name}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(p.issued_at).toLocaleString()}{p.diagnosis ? ` · ${p.diagnosis}` : ""}</p>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {meds.map((m: any, i: number) => (
                      <li key={i}><span className="font-medium">{m.name}</span>{m.dose ? ` · ${m.dose}` : ""}{m.frequency ? ` · ${m.frequency}` : ""}{m.duration ? ` · ${m.duration}` : ""}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {p.dispense ? (
                    <Badge className="bg-success/10 text-success border-success/30" variant="outline">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Dispensed
                    </Badge>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => dispMut.mutate({ prescriptionId: p.id, total: 0 })} disabled={dispMut.isPending || billMut.isPending}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark dispensed
                      </Button>
                      <Button size="sm" onClick={() => billMut.mutate({ prescriptionId: p.id })} disabled={dispMut.isPending || billMut.isPending}>
                        Dispense & bill
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
