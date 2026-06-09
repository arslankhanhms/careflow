import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2, PackagePlus, ClipboardList, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { listSuppliers, listMedicines, listPurchases, createPurchase, receivePurchase } from "@/lib/pharmacy.functions";

type Line = { medicine_id: string; name: string; qty: number; purchase_price: number };

export function PharmacyPurchasesTab({ slug, enabled }: { slug: string; enabled: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPurchases);
  const recvFn = useServerFn(receivePurchase);
  const [open, setOpen] = useState(false);

  const q = useQuery({ queryKey: ["pharm-pur", slug], queryFn: () => listFn({ data: { slug } }), enabled });
  const recvMut = useMutation({
    mutationFn: (id: string) => recvFn({ data: { id } }),
    onSuccess: () => { toast.success("Stock received"); qc.invalidateQueries({ queryKey: ["pharm-pur", slug] }); qc.invalidateQueries({ queryKey: ["pharm-meds", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = q.data?.purchases ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Purchase orders ({rows.length})</span>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><PackagePlus className="mr-1 h-4 w-4" /> New PO</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
              <PurchaseForm slug={slug} enabled={enabled} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["pharm-pur", slug] }); qc.invalidateQueries({ queryKey: ["pharm-meds", slug] }); }} />
              <DialogFooter />
            </DialogContent>
          </Dialog>
        </div>
        {q.isLoading ? (
          <div className="flex items-center justify-center p-8 text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No purchase orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Supplier</th>
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium" />
              </tr></thead>
              <tbody>{rows.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{p.supplier?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{p.reference_no ?? "—"}</td>
                  <td className="px-4 py-2 font-medium">Rs {Number(p.total).toFixed(0)}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={p.status === "received" ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {p.status !== "received" && (
                      <Button size="sm" variant="outline" onClick={() => recvMut.mutate(p.id)} disabled={recvMut.isPending}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Receive
                      </Button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function PurchaseForm({ slug, enabled, onDone }: { slug: string; enabled: boolean; onDone: () => void }) {
  const supFn = useServerFn(listSuppliers);
  const medFn = useServerFn(listMedicines);
  const createFn = useServerFn(createPurchase);

  const supQ = useQuery({ queryKey: ["pharm-sup-sel", slug], queryFn: () => supFn({ data: { slug } }), enabled });
  const medQ = useQuery({ queryKey: ["pharm-med-sel", slug], queryFn: () => medFn({ data: { slug } }), enabled });

  const [supplierId, setSupplierId] = useState<string>("");
  const [ref, setRef] = useState("");
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.purchase_price, 0), [lines]);
  const total = subtotal + tax;

  const createMut = useMutation({
    mutationFn: () => createFn({
      data: {
        slug,
        supplier_id: supplierId || null,
        reference_no: ref || null,
        tax, notes: notes || null,
        receive_now: receiveNow,
        items: lines.map(l => ({ medicine_id: l.medicine_id, qty: l.qty, purchase_price: l.purchase_price })),
      },
    }),
    onSuccess: () => { toast.success("Purchase order saved"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function addLine(medId: string) {
    const m = (medQ.data?.medicines ?? []).find((x: any) => x.id === medId);
    if (!m || lines.some(l => l.medicine_id === medId)) return;
    setLines([...lines, { medicine_id: m.id, name: m.name, qty: 10, purchase_price: Number(m.purchase_price ?? 0) }]);
  }
  function update(id: string, patch: Partial<Line>) {
    setLines(prev => prev.map(l => l.medicine_id === id ? { ...l, ...patch } : l));
  }
  function remove(id: string) { setLines(prev => prev.filter(l => l.medicine_id !== id)); }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Supplier</Label>
          <Select value={supplierId || "_none"} onValueChange={(v) => setSupplierId(v === "_none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— None —</SelectItem>
              {(supQ.data?.suppliers ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Reference #</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Invoice #" /></div>
      </div>

      <div>
        <Label className="text-xs">Add medicine</Label>
        <Select value="" onValueChange={addLine}>
          <SelectTrigger><SelectValue placeholder="Pick a medicine to add…" /></SelectTrigger>
          <SelectContent>
            {(medQ.data?.medicines ?? []).map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.name} {m.company ? `· ${m.company}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-2 py-1.5">Medicine</th><th className="px-2 py-1.5">Qty</th><th className="px-2 py-1.5">Cost</th><th className="px-2 py-1.5">Total</th><th />
            </tr></thead>
            <tbody>{lines.map(l => (
              <tr key={l.medicine_id} className="border-b last:border-0">
                <td className="px-2 py-1.5">{l.name}</td>
                <td className="px-2 py-1.5"><Input type="number" value={l.qty} onChange={(e) => update(l.medicine_id, { qty: Number(e.target.value) })} className="h-7 w-20" /></td>
                <td className="px-2 py-1.5"><Input type="number" step="0.01" value={l.purchase_price} onChange={(e) => update(l.medicine_id, { purchase_price: Number(e.target.value) })} className="h-7 w-24" /></td>
                <td className="px-2 py-1.5 font-medium">Rs {(l.qty * l.purchase_price).toFixed(0)}</td>
                <td className="px-2 py-1.5 text-right"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(l.medicine_id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Tax (Rs)</Label><Input type="number" value={tax} onChange={(e) => setTax(Number(e.target.value))} /></div>
        <div className="flex items-end gap-2 pb-1">
          <Checkbox id="recv" checked={receiveNow} onCheckedChange={(v) => setReceiveNow(!!v)} />
          <Label htmlFor="recv" className="text-xs">Receive stock immediately</Label>
        </div>
      </div>
      <div><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      <div className="flex items-center justify-between rounded-md border bg-secondary/40 p-2 text-sm">
        <span className="text-muted-foreground">Subtotal Rs {subtotal.toFixed(0)} · Tax Rs {tax.toFixed(0)}</span>
        <span className="text-base font-bold">Total: Rs {total.toFixed(0)}</span>
      </div>

      <Button className="w-full" disabled={!lines.length || createMut.isPending} onClick={() => createMut.mutate()}>
        {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Save purchase order
      </Button>
    </div>
  );
}
