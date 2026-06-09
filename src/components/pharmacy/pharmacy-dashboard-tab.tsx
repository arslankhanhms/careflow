import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Package, AlertTriangle, CalendarClock, Wallet, BadgeDollarSign } from "lucide-react";
import { StatCard } from "@/components/module-page";
import { getPharmacyDashboard } from "@/lib/pharmacy.functions";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function PharmacyDashboardTab({ slug, enabled }: { slug: string; enabled: boolean }) {
  const fn = useServerFn(getPharmacyDashboard);
  const q = useQuery({
    queryKey: ["pharm-dash", slug],
    queryFn: () => fn({ data: { slug } }),
    enabled,
    refetchInterval: 60000,
  });
  if (!enabled) return null;
  if (q.isLoading) {
    return <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading dashboard…</div>;
  }
  if (q.error) return <Card className="p-6 text-sm text-destructive">{(q.error as Error).message}</Card>;
  const d = q.data!;
  const k = d.kpis;
  const fmt = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total SKUs" value={String(k.totalSkus)} />
        <StatCard label="In-stock units" value={String(k.totalStock)} />
        <StatCard label="Inventory value" value={fmt(k.inventoryValue)} tone="info" />
        <StatCard label="Today's sales" value={fmt(k.todayRevenue)} tone="success" />
        <StatCard label="30-day sales" value={fmt(k.monthRevenue)} tone="success" />
        <StatCard label="Low / Expiring" value={`${k.lowStockCount} / ${k.expiringCount}`} tone={k.lowStockCount + k.expiringCount > 0 ? "warning" : "info"} />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Sales — last 30 days</h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.chart}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning-foreground" />
            <h3 className="text-sm font-semibold">Low-stock alerts</h3>
            <Badge variant="outline">{d.lowStock.length}</Badge>
          </div>
          {d.lowStock.length === 0 ? (
            <p className="text-xs text-muted-foreground">All medicines above minimum stock.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.lowStock.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-destructive">{m.stock_qty} / min {m.min_stock_level}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">Expiring within 30 days</h3>
            <Badge variant="outline">{d.expiring.length}</Badge>
          </div>
          {d.expiring.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing expiring soon.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.expiring.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">exp {m.expiry_date} · {m.stock_qty} u</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
