import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, Plus, Minus, Trash2, Receipt, Printer, UserPlus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  listMedicines, listPharmacyCustomers, createPharmacyCustomer, createPharmacySale,
  getPharmacySettings, lookupPharmacyPatient,
} from "@/lib/pharmacy.functions";


type CartLine = { medicine_id: string; name: string; unit_price: number; qty: number; stock_qty: number };

export function PharmacyPosTab({ slug, enabled }: { slug: string; enabled: boolean }) {
  const qc = useQueryClient();
  const listMedsFn = useServerFn(listMedicines);
  const listCustFn = useServerFn(listPharmacyCustomers);
  const createCustFn = useServerFn(createPharmacyCustomer);
  const createSaleFn = useServerFn(createPharmacySale);
  const settingsFn = useServerFn(getPharmacySettings);
  const lookupFn = useServerFn(lookupPharmacyPatient);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [walkIn, setWalkIn] = useState("");
  const [payment, setPayment] = useState<"cash" | "card" | "online" | "credit">("cash");
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [taxManual, setTaxManual] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookingUp, setLookingUp] = useState(false);

  async function handleLookup() {
    const q = patientQuery.trim();
    if (q.length < 2) { toast.error("Enter MRN, CNIC or phone"); return; }
    try {
      setLookingUp(true);
      const r: any = await lookupFn({ data: { slug, query: q } });
      if (!r.patient) { toast.error("No patient found"); setLookupResult(null); return; }
      setLookupResult(r);
      toast.success(`Found ${r.patient.first_name} ${r.patient.last_name} · ${r.prescriptions.length} prescriptions`);
    } catch (e: any) {
      toast.error(e?.message || "Lookup failed");
    } finally { setLookingUp(false); }
  }

  function loadFromPrescription(rx: any) {
    const meds = (rx.medications as any[]) ?? [];
    if (!meds.length) { toast.error("Prescription has no medications"); return; }
    const available = medsQ.data?.medicines ?? [];
    const added: CartLine[] = [];
    const missing: string[] = [];
    for (const m of meds) {
      const name = (m.name || m.brand || m.generic || "").toString().toLowerCase();
      if (!name) continue;
      const match = available.find((a: any) =>
        (a.name ?? "").toLowerCase().includes(name) ||
        (a.generic_name ?? "").toLowerCase().includes(name) ||
        name.includes((a.name ?? "").toLowerCase()),
      );
      if (match && match.stock_qty > 0) {
        const qty = Number(m.qty ?? m.quantity ?? 1) || 1;
        added.push({ medicine_id: match.id, name: match.name, unit_price: Number(match.sale_price ?? 0), qty: Math.min(qty, match.stock_qty), stock_qty: match.stock_qty });
      } else {
        missing.push(m.name || m.brand || m.generic);
      }
    }
    if (!added.length) { toast.error("No matching medicines in inventory"); return; }
    setCart((prev) => {
      const next = [...prev];
      for (const a of added) {
        const i = next.findIndex((x) => x.medicine_id === a.medicine_id);
        if (i >= 0) next[i] = { ...next[i], qty: Math.min(next[i].qty + a.qty, next[i].stock_qty) };
        else next.push(a);
      }
      return next;
    });
    toast.success(`Loaded ${added.length} item(s)${missing.length ? ` · ${missing.length} missing` : ""}`);
  }



  const settingsQ = useQuery({
    queryKey: ["pharm-settings", slug],
    queryFn: () => settingsFn({ data: { slug } }),
    enabled,
  });
  const settings = settingsQ.data?.settings;
  const currency = (settings?.currency as string | undefined) ?? "Rs";
  const receiptFooter = (settings?.receipt_footer as string | undefined) ?? "Thank you for your purchase";

  // Apply default discount/tax once when settings load (or after a sale that reset state)
  useEffect(() => {
    if (!settings || defaultsApplied) return;
    setDiscount(Number(settings.default_discount_percent ?? 0));
    setDiscountType((settings.default_discount_type as "percent" | "fixed") ?? "percent");
    setDefaultsApplied(true);
  }, [settings, defaultsApplied]);

  const medsQ = useQuery({
    queryKey: ["pharm-pos-meds", slug, search],
    queryFn: () => listMedsFn({ data: { slug, search } }),
    enabled,
  });
  const custQ = useQuery({
    queryKey: ["pharm-pos-cust", slug],
    queryFn: () => listCustFn({ data: { slug } }),
    enabled,
  });


  const createCustMut = useMutation({
    mutationFn: (d: any) => createCustFn({ data: { slug, ...d } }),
    onSuccess: (r: any) => {
      toast.success("Customer added");
      setCustOpen(false);
      setCustomerId(r.customer.id);
      qc.invalidateQueries({ queryKey: ["pharm-pos-cust", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const saleMut = useMutation({
    mutationFn: () =>
      createSaleFn({
        data: {
          slug,
          customer_id: customerId || null,
          customer_name: customerId ? null : walkIn || "Walk-in",
          payment_method: payment,
          discount, discount_type: discountType, tax,
          notes: notes || null,
          items: cart.map((c) => ({ medicine_id: c.medicine_id, name: c.name, qty: c.qty, unit_price: c.unit_price })),
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`Invoice ${r.sale.invoice_no} saved`);
      setLastSale({ ...r.sale, items: cart, currency, receiptFooter });
      setCart([]); setDiscount(Number(settings?.default_discount_percent ?? 0));
      setDiscountType((settings?.default_discount_type as "percent" | "fixed") ?? "percent");
      setTax(0); setTaxManual(false); setNotes(""); setWalkIn(""); setCustomerId("");
      qc.invalidateQueries({ queryKey: ["pharm-pos-meds", slug] });
      qc.invalidateQueries({ queryKey: ["pharm-meds", slug] });
      qc.invalidateQueries({ queryKey: ["pharm-dash", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sale failed"),
  });


  function addToCart(m: any) {
    if (m.stock_qty <= 0) { toast.error(`${m.name} is out of stock`); return; }
    setCart((prev) => {
      const ex = prev.find((p) => p.medicine_id === m.id);
      if (ex) {
        if (ex.qty + 1 > m.stock_qty) { toast.error("Not enough stock"); return prev; }
        return prev.map((p) => p.medicine_id === m.id ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { medicine_id: m.id, name: m.name, unit_price: Number(m.sale_price ?? 0), qty: 1, stock_qty: m.stock_qty }];
    });
  }
  function setQty(id: string, qty: number) {
    setCart((prev) => prev.flatMap((p) => {
      if (p.medicine_id !== id) return [p];
      const q = Math.min(Math.max(0, qty), p.stock_qty);
      return q === 0 ? [] : [{ ...p, qty: q }];
    }));
  }

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.qty * c.unit_price, 0), [cart]);
  const discountAmt = discountType === "percent" ? (subtotal * discount) / 100 : discount;

  // Auto-derive tax from default_tax_percent unless user manually overrode it
  useEffect(() => {
    if (taxManual) return;
    const pct = Number(settings?.default_tax_percent ?? 0);
    const base = Math.max(0, subtotal - discountAmt);
    setTax(Math.round(base * pct) / 100);
  }, [subtotal, discountAmt, settings?.default_tax_percent, taxManual]);

  const total = Math.max(0, subtotal - discountAmt + tax);

  const meds = medsQ.data?.medicines ?? [];


  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* Left: medicine grid */}
      <Card className="p-0">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicines…" className="pl-9" />
          </div>
        </div>
        {medsQ.isLoading ? (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : meds.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No medicines found.</div>
        ) : (
          <div className="grid max-h-[68vh] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
            {meds.map((m: any) => (
              <button
                key={m.id}
                onClick={() => addToCart(m)}
                disabled={m.stock_qty <= 0}
                className="group rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-md disabled:opacity-50"
              >
                <div className="line-clamp-2 text-sm font-semibold">{m.name}</div>
                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{m.generic_name ?? m.company ?? ""}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-primary">Rs {Number(m.sale_price ?? 0).toFixed(0)}</span>
                  <Badge variant={m.stock_qty <= 0 ? "destructive" : m.stock_qty <= (m.min_stock_level ?? 10) ? "outline" : "secondary"} className="text-[10px]">
                    {m.stock_qty} {m.unit}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Right: cart */}
      <Card className="flex flex-col p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Cart ({cart.length})</span></div>
          {cart.length > 0 && <Button size="sm" variant="ghost" onClick={() => setCart([])}>Clear</Button>}
        </div>

        <div className="space-y-2 border-b bg-secondary/30 p-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient lookup (MRN / CNIC / Phone)</Label>
          <div className="flex gap-1">
            <Input
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="e.g. MRN-2026-001234"
              className="h-8 text-sm"
            />
            <Button size="sm" variant="outline" onClick={handleLookup} disabled={lookingUp}>
              {lookingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {lookupResult?.patient && (
            <div className="rounded-md border bg-card p-2 text-xs">
              <div className="font-semibold">{lookupResult.patient.first_name} {lookupResult.patient.last_name}</div>
              <div className="text-muted-foreground">{lookupResult.patient.mrn}{lookupResult.patient.cnic ? ` · ${lookupResult.patient.cnic}` : ""}</div>
              {lookupResult.patient.allergies && (
                <div className="mt-1 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">⚠ Allergies: {lookupResult.patient.allergies}</div>
              )}
              {lookupResult.prescriptions.length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  <div className="text-muted-foreground">Recent prescriptions:</div>
                  {lookupResult.prescriptions.slice(0, 3).map((rx: any) => (
                    <div key={rx.id} className="flex items-center justify-between gap-1 rounded border bg-background p-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{rx.diagnosis || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">{new Date(rx.issued_at).toLocaleDateString()} · {(rx.medications as any[])?.length ?? 0} meds</div>
                      </div>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => loadFromPrescription(rx)}>Load</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-muted-foreground">No recent prescriptions.</div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Customer</Label>
              <Select value={customerId || "_walk"} onValueChange={(v) => setCustomerId(v === "_walk" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_walk">Walk-in customer</SelectItem>
                  {(custQ.data?.customers ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Dialog open={custOpen} onOpenChange={setCustOpen}>
              <DialogTrigger asChild><Button size="icon" variant="outline"><UserPlus className="h-4 w-4" /></Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
                <CustomerForm loading={createCustMut.isPending} onSubmit={(d) => createCustMut.mutate(d)} />
                <DialogFooter />
              </DialogContent>
            </Dialog>
          </div>
          {!customerId && (
            <Input value={walkIn} onChange={(e) => setWalkIn(e.target.value)} placeholder="Walk-in name (optional)" className="text-sm" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto border-y">
          {cart.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Click a medicine to add it.</p>
          ) : cart.map((l) => (
            <div key={l.medicine_id} className="flex items-center gap-2 border-b p-2 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">{currency} {l.unit_price.toFixed(0)} × {l.qty} = <span className="font-semibold text-foreground">{currency} {(l.unit_price * l.qty).toFixed(0)}</span></p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setQty(l.medicine_id, l.qty - 1)}><Minus className="h-3 w-3" /></Button>
                <Input type="number" value={l.qty} onChange={(e) => setQty(l.medicine_id, Number(e.target.value))} className="h-7 w-12 text-center text-xs" />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setQty(l.medicine_id, l.qty + 1)}><Plus className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCart((p) => p.filter((x) => x.medicine_id !== l.medicine_id))}><Trash2 className="h-3 w-3 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Discount</Label>
              <div className="flex gap-1">
                <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="h-8" />
                <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="fixed">{currency}</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Tax ({currency})</Label>
              <Input type="number" value={tax} onChange={(e) => { setTaxManual(true); setTax(Number(e.target.value)); }} className="h-8" />
            </div>

          </div>
          <div>
            <Label className="text-xs">Payment</Label>
            <Select value={payment} onValueChange={(v: any) => setPayment(v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="credit">Credit (on account)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-secondary/40 p-2 text-xs">
            <Row label="Subtotal" value={subtotal} currency={currency} />
            <Row label="Discount" value={-discountAmt} currency={currency} />
            <Row label="Tax" value={tax} currency={currency} />
            <div className="mt-1 border-t pt-1"><Row label="Total" value={total} currency={currency} bold /></div>
          </div>

          <Button className="w-full" disabled={!cart.length || saleMut.isPending} onClick={() => saleMut.mutate()}>
            {saleMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
            Complete sale · {currency} {total.toFixed(0)}
          </Button>
        </div>
      </Card>

      {lastSale && <InvoiceDialog sale={lastSale} onClose={() => setLastSale(null)} />}
    </div>
  );
}

function Row({ label, value, bold, currency }: { label: string; value: number; bold?: boolean; currency: string }) {
  return (
    <div className={`flex justify-between ${bold ? "text-sm font-bold" : ""}`}>
      <span>{label}</span><span>{currency} {value.toFixed(0)}</span>
    </div>
  );
}


function CustomerForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [v, setV] = useState({ name: "", phone: "", cnic: "", address: "" });
  return (
    <div className="space-y-2">
      <div><Label>Name *</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Phone</Label><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
        <div><Label>CNIC</Label><Input value={v.cnic} onChange={(e) => setV({ ...v, cnic: e.target.value })} /></div>
      </div>
      <div><Label>Address</Label><Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></div>
      <Button className="w-full" disabled={loading || !v.name} onClick={() => onSubmit(v)}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
      </Button>
    </div>
  );
}

function InvoiceDialog({ sale, onClose }: { sale: any; onClose: () => void }) {
  const cur = sale.currency ?? "Rs";
  const footer = sale.receiptFooter ?? "Thank you for your purchase";
  function printIt() {
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return;
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const rows = (sale.items as CartLine[]).map((i) =>
      `<tr><td>${esc(i.name)}</td><td style="text-align:center">${esc(i.qty)}</td><td style="text-align:right">${esc((i.unit_price * i.qty).toFixed(0))}</td></tr>`
    ).join("");
    w.document.write(`
      <html><head><title>${esc(sale.invoice_no)}</title>
      <style>body{font-family:system-ui;padding:16px;max-width:320px}h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}td,th{border-bottom:1px dashed #ccc;padding:4px 0}.t{font-weight:700;font-size:14px}</style>
      </head><body>
      <h2>Pharmacy Invoice</h2>
      <div style="font-size:12px;color:#666">#${esc(sale.invoice_no)}<br/>${esc(new Date(sale.created_at).toLocaleString())}</div>
      <table><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Amt</th></tr></thead><tbody>${rows}</tbody></table>
      <div style="margin-top:8px;font-size:12px">
        <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${esc(cur)} ${esc(Number(sale.subtotal).toFixed(0))}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Discount</span><span>-${esc(cur)} ${esc(Number(sale.discount).toFixed(0))}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Tax</span><span>${esc(cur)} ${esc(Number(sale.tax).toFixed(0))}</span></div>
        <div class="t" style="display:flex;justify-content:space-between;border-top:1px solid #000;padding-top:4px;margin-top:4px"><span>Total</span><span>${esc(cur)} ${esc(Number(sale.total).toFixed(0))}</span></div>
        <div style="margin-top:6px">Payment: ${esc(String(sale.payment_method).toUpperCase())}</div>
      </div>
      <p style="text-align:center;color:#666;font-size:11px;margin-top:12px">${esc(footer)}</p>
      </body></html>`);
    w.document.close(); w.focus(); w.print();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Sale completed</DialogTitle></DialogHeader>
        <div className="space-y-2 rounded-md border bg-secondary/30 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-mono font-semibold">{sale.invoice_no}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{(sale.items ?? []).length}</span></div>
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{cur} {Number(sale.total).toFixed(0)}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Payment</span><span className="uppercase">{sale.payment_method}</span></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={printIt}><Printer className="mr-2 h-4 w-4" /> Print invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

