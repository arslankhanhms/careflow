import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Receipt, Package, Wallet, Download, ShieldCheck } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { getPharmacyReports, listPharmacyAuditLogs } from "@/lib/pharmacy.functions";

function fmtPKR(n: number) {
  return `Rs ${Math.round(Number(n) || 0).toLocaleString()}`;
}

export function PharmacyReportsTab({ slug, enabled }: { slug: string; enabled: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const reports = useServerFn(getPharmacyReports);
  const auditFn = useServerFn(listPharmacyAuditLogs);
  const q = useQuery({
    queryKey: ["pharm-reports", slug, from, to],
    queryFn: () => reports({ data: { slug, from, to } }),
    enabled,
  });
  const auditQ = useQuery({
    queryKey: ["pharm-audit", slug, from, to],
    queryFn: () => auditFn({ data: { slug, from, to, limit: 500 } }),
    enabled,
  });

  const data = q.data;
  const auditLogs = (auditQ.data?.logs ?? []) as any[];
  const grossProfit = useMemo(() => {
    if (!data) return 0;
    return data.kpis.totalRevenue - data.kpis.totalPurchases;
  }, [data]);

  function downloadCsv(name: string, rows: (string | number)[][]) {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [["Invoice", "Date", "Customer", "Payment", "Subtotal", "Discount", "Tax", "Total"]];
    for (const s of data.recentSales as any[]) {
      rows.push([
        s.invoice_no, new Date(s.sold_at).toLocaleString(), s.customer_name_snapshot ?? "Walk-in",
        s.payment_method, String(s.subtotal), String(s.discount ?? 0), String(s.tax ?? 0), String(s.total),
      ]);
    }
    downloadCsv(`pharmacy-sales-${from}_${to}.csv`, rows);
  }

  function exportAuditCsv() {
    if (!auditLogs.length) return;
    const rows: (string | number)[][] = [["When", "Action", "Actor", "Entity", "Entity ID", "Invoice", "Total", "Items", "Patient ID"]];
    for (const l of auditLogs) {
      const m = l.metadata ?? {};
      rows.push([
        new Date(l.created_at).toLocaleString(),
        l.action,
        l.actor_name ?? "System",
        l.entity_type ?? "",
        l.entity_id ?? "",
        m.invoice_no ?? "",
        m.total ?? "",
        m.items_count ?? "",
        m.patient_id ?? "",
      ]);
    }
    downloadCsv(`pharmacy-audit-${from}_${to}.csv`, rows);
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>Refresh</Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}><Download className="mr-1.5 h-4 w-4" /> Export CSV</Button>
        <div className="ml-auto text-xs text-muted-foreground">{data ? `${data.kpis.orders} orders · ${data.kpis.unitsSold} units` : ""}</div>
      </Card>

      {q.isLoading || !data ? (
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading reports…</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi icon={<Receipt className="h-4 w-4" />} label="Revenue" value={fmtPKR(data.kpis.totalRevenue)} />
            <Kpi icon={<Package className="h-4 w-4" />} label="Purchases" value={fmtPKR(data.kpis.totalPurchases)} />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Gross Profit" value={fmtPKR(grossProfit)} tone={grossProfit >= 0 ? "ok" : "warn"} />
            <Kpi icon={<Wallet className="h-4 w-4" />} label="Discount / Tax" value={`${fmtPKR(data.kpis.totalDiscount)} / ${fmtPKR(data.kpis.totalTax)}`} />
          </div>

          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Daily revenue</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmtPKR(Number(v))} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Top medicines</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topMedicines} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip formatter={(v: any) => fmtPKR(Number(v))} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">Payment methods</p>
              <div className="space-y-2">
                {data.paymentMix.length === 0 && <p className="text-xs text-muted-foreground">No sales in this period.</p>}
                {data.paymentMix.map((p) => {
                  const pct = data.kpis.totalRevenue > 0 ? (p.amount / data.kpis.totalRevenue) * 100 : 0;
                  return (
                    <div key={p.method}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="capitalize font-medium">{p.method}</span>
                        <span className="text-muted-foreground">{fmtPKR(p.amount)} · {pct.toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card className="p-0">
            <div className="border-b p-4"><p className="text-sm font-semibold">Recent sales</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Invoice</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Payment</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data.recentSales as any[]).map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 font-mono text-xs">{s.invoice_no}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(s.sold_at).toLocaleString()}</td>
                      <td className="px-4 py-2">{s.customer_name_snapshot ?? "Walk-in"}</td>
                      <td className="px-4 py-2"><Badge variant="outline" className="capitalize">{s.payment_method}</Badge></td>
                      <td className="px-4 py-2 text-right font-semibold">{fmtPKR(s.total)}</td>
                    </tr>
                  ))}
                  {(data.recentSales as any[]).length === 0 && (
                    <tr><td className="px-4 py-6 text-center text-xs text-muted-foreground" colSpan={5}>No sales in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Audit log · dispense &amp; POS</p>
                <Badge variant="outline" className="text-[10px]">{auditLogs.length}</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={exportAuditCsv} disabled={!auditLogs.length}>
                <Download className="mr-1.5 h-4 w-4" /> Export audit CSV
              </Button>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">When</th>
                    <th className="px-4 py-2 text-left">Action</th>
                    <th className="px-4 py-2 text-left">Actor</th>
                    <th className="px-4 py-2 text-left">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditLogs.map((l: any) => {
                    const m = l.metadata ?? {};
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className={l.action === "pharmacy.sale" ? "border-primary/30 bg-primary/5" : "border-success/30 bg-success/5"}>
                            {l.action === "pharmacy.sale" ? "Sale" : "Dispense"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-xs">{l.actor_name ?? "System"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {m.invoice_no && <span className="font-mono mr-2">{m.invoice_no}</span>}
                          {m.items_count != null && <span className="mr-2">{m.items_count} item(s)</span>}
                          {m.total != null && <span className="mr-2 font-medium text-foreground">{fmtPKR(Number(m.total))}</span>}
                          {m.payment_method && <span className="capitalize mr-2">· {m.payment_method}</span>}
                          {Array.isArray(m.unmatched) && m.unmatched.length > 0 && (
                            <span className="text-warning">· {m.unmatched.length} unmatched</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {auditLogs.length === 0 && (
                    <tr><td className="px-4 py-6 text-center text-xs text-muted-foreground" colSpan={4}>No dispense or POS activity in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <p className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</p>
    </Card>
  );
}
