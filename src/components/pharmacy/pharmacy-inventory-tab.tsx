import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Minus, Trash2, Pill, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/module-page";
import { listMedicines, createMedicine, adjustMedicineStock, deleteMedicine, getPharmacySettings } from "@/lib/pharmacy.functions";
import { PharmacyBulkUploadDialog } from "./pharmacy-bulk-upload-dialog";

function tone(qty: number, min: number, expiry: string | null | undefined, expiryWarnDays: number): "ok" | "warn" | "danger" {
  if (expiry) {
    const days = (new Date(expiry).getTime() - Date.now()) / 86400000;
    if (days < expiryWarnDays) return "danger";
  }
  if (qty <= 0) return "danger";
  if (qty <= min) return "warn";
  return "ok";
}


export function PharmacyInventoryTab({ slug, enabled }: { slug: string; enabled: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMedicines);
  const createFn = useServerFn(createMedicine);
  const adjFn = useServerFn(adjustMedicineStock);
  const delFn = useServerFn(deleteMedicine);
  const settingsFn = useServerFn(getPharmacySettings);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["pharm-settings", slug],
    queryFn: () => settingsFn({ data: { slug } }),
    enabled,
  });
  const settings = settingsQ.data?.settings;
  const lowThreshold = Number(settings?.low_stock_threshold ?? 10);
  const expiryWarnDays = Number(settings?.expiry_warning_days ?? 30);
  const currency = (settings?.currency as string | undefined) ?? "Rs";

  const q = useQuery({
    queryKey: ["pharm-meds", slug, submitted],
    queryFn: () => listFn({ data: { slug, search: submitted } }),
    enabled,
  });
  const createMut = useMutation({
    mutationFn: (d: any) => createFn({ data: { slug, ...d } }),
    onSuccess: () => { toast.success("Medicine added"); setOpen(false); qc.invalidateQueries({ queryKey: ["pharm-meds", slug] }); qc.invalidateQueries({ queryKey: ["pharm-dash", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const adjMut = useMutation({
    mutationFn: (v: { id: string; delta: number }) => adjFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pharm-meds", slug] }); qc.invalidateQueries({ queryKey: ["pharm-dash", slug] }); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["pharm-meds", slug] }); },
  });

  const meds = q.data?.medicines ?? [];


  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setSubmitted(search.trim()); }}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, generic, or barcode…" className="pl-9" />
          </div>
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <Button variant="outline" onClick={() => setBulkOpen(true)}><Upload className="mr-1.5 h-4 w-4" /> Bulk upload</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1.5 h-4 w-4" /> Add medicine</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Add medicine</DialogTitle></DialogHeader>
            <MedicineForm loading={createMut.isPending} defaultMinStock={lowThreshold} onSubmit={(d) => createMut.mutate(d)} />
            <DialogFooter />

          </DialogContent>
        </Dialog>
        <PharmacyBulkUploadDialog slug={slug} open={bulkOpen} onOpenChange={setBulkOpen} />
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
      ) : meds.length === 0 ? (
        <div className="flex flex-col items-center p-12 text-center">
          <Pill className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No medicines yet</p>
          <p className="text-xs text-muted-foreground">Click “Add medicine” to start your inventory.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Medicine</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium">Price ({currency})</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr></thead>
            <tbody>{meds.map((m: any) => {
              const t = tone(m.stock_qty, m.min_stock_level ?? lowThreshold, m.expiry_date, expiryWarnDays);

              return (
                <tr key={m.id} className="border-b last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{m.generic_name ?? ""} {m.category?.name ? <Badge variant="outline" className="ml-1 text-[10px]">{m.category.name}</Badge> : null}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.company ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => adjMut.mutate({ id: m.id, delta: -1 })}><Minus className="h-3 w-3" /></Button>
                      <span className="w-10 text-center font-semibold">{m.stock_qty}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => adjMut.mutate({ id: m.id, delta: 1 })}><Plus className="h-3 w-3" /></Button>
                      <span className="ml-1 text-xs text-muted-foreground">{m.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.expiry_date ?? "—"}</td>
                  <td className="px-4 py-3">{currency} {Number(m.sale_price ?? 0).toFixed(0)}</td>
                  <td className="px-4 py-3"><StatusBadge status={t === "ok" ? "OK" : t === "warn" ? "Low" : "Critical"} tone={t} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${m.name}?`)) delMut.mutate(m.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MedicineForm({ onSubmit, loading, defaultMinStock }: { onSubmit: (d: any) => void; loading: boolean; defaultMinStock: number }) {
  const [v, setV] = useState({
    name: "", generic_name: "", company: "", batch_no: "", unit: "tablet",
    stock_qty: 100, min_stock_level: defaultMinStock, purchase_price: 0, sale_price: 0,
    expiry_date: "", barcode: "",
  });

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2"><Label>Name *</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Panadol 500mg" /></div>
      <div><Label>Generic name</Label><Input value={v.generic_name} onChange={(e) => setV({ ...v, generic_name: e.target.value })} placeholder="Paracetamol" /></div>
      <div><Label>Company</Label><Input value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} placeholder="GSK" /></div>
      <div><Label>Batch #</Label><Input value={v.batch_no} onChange={(e) => setV({ ...v, batch_no: e.target.value })} /></div>
      <div><Label>Unit</Label><Input value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} placeholder="tablet / strip / bottle" /></div>
      <div><Label>Stock qty</Label><Input type="number" value={v.stock_qty} onChange={(e) => setV({ ...v, stock_qty: Number(e.target.value) })} /></div>
      <div><Label>Min stock level</Label><Input type="number" value={v.min_stock_level} onChange={(e) => setV({ ...v, min_stock_level: Number(e.target.value) })} /></div>
      <div><Label>Purchase price (PKR)</Label><Input type="number" step="0.01" value={v.purchase_price} onChange={(e) => setV({ ...v, purchase_price: Number(e.target.value) })} /></div>
      <div><Label>Sale price (PKR)</Label><Input type="number" step="0.01" value={v.sale_price} onChange={(e) => setV({ ...v, sale_price: Number(e.target.value) })} /></div>
      <div><Label>Expiry date</Label><Input type="date" value={v.expiry_date} onChange={(e) => setV({ ...v, expiry_date: e.target.value })} /></div>
      <div><Label>Barcode</Label><Input value={v.barcode} onChange={(e) => setV({ ...v, barcode: e.target.value })} /></div>
      <Button className="md:col-span-2" disabled={loading || !v.name} onClick={() => onSubmit(v)}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pill className="mr-2 h-4 w-4" />} Add to inventory
      </Button>
    </div>
  );
}
