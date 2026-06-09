import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, TrendingUp, Receipt, Wallet, BanknoteIcon, Users, Stethoscope, FlaskConical, Pill, CreditCard } from "lucide-react";
import { getDoctorEarnings } from "@/lib/dashboard.functions";
import { getDailyCollections } from "@/lib/collections.functions";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/hospital/$slug/earnings")({
  head: () => ({ meta: [{ title: "Doctors earnings" }] }),
  component: EarningsPage,
});

function EarningsPage() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getDoctorEarnings);
  const collFn = useServerFn(getDailyCollections);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["doc-earnings-page"], queryFn: () => fn(), refetchInterval: 30_000 });
  const collQ = useQuery({
    queryKey: ["collections-today", slug],
    queryFn: () => collFn({ data: { slug } }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase.channel("hospital-earnings")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => { qc.invalidateQueries({ queryKey: ["doc-earnings-page"] }); qc.invalidateQueries({ queryKey: ["collections-today", slug] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" },
        () => qc.invalidateQueries({ queryKey: ["doc-earnings-page"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" },
        () => { qc.invalidateQueries({ queryKey: ["doc-earnings-page"] }); qc.invalidateQueries({ queryKey: ["collections-today", slug] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_sales" },
        () => qc.invalidateQueries({ queryKey: ["collections-today", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_dispenses" },
        () => qc.invalidateQueries({ queryKey: ["doc-earnings-page"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "concession_requests" },
        () => qc.invalidateQueries({ queryKey: ["doc-earnings-page"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, slug]);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");

  const data = q.data;
  const doctors = (data?.doctors ?? []) as any[];
  const days = data?.days ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return doctors;
    return doctors.filter((d) => (d.name || "").toLowerCase().includes(term) || (d.specialization || "").toLowerCase().includes(term));
  }, [doctors, search]);

  useEffect(() => {
    if (!selectedId && doctors[0]) setSelectedId(doctors[0].doctor_id);
  }, [doctors, selectedId]);

  const current = doctors.find((d) => d.doctor_id === selectedId);
  const top = doctors[0];
  const totalToday = doctors.reduce((s, d) => s + d.today_earnings, 0);
  const totalWeek = doctors.reduce((s, d) => s + d.week_earnings, 0);
  const totalPaid = doctors.reduce((s, d) => s + d.paid_count, 0);
  const totalPending = doctors.reduce((s, d) => s + d.pending_count, 0);

  if (q.isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Doctors earnings</h1>
          <p className="text-sm text-muted-foreground">Per-doctor revenue, today + last 7 days. Updates live on payment.</p>
        </div>
        <Badge variant="outline">Live</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={Receipt} label="Today total" value={`Rs ${totalToday.toLocaleString()}`} />
        <Stat icon={TrendingUp} label="Last 7 days" value={`Rs ${totalWeek.toLocaleString()}`} />
        <Stat icon={Users} label="Paid appts" value={totalPaid} />
        <Stat icon={Users} label="Pending appts" value={totalPending} hint={top ? `Top: ${top.name}` : ""} />
      </div>

      {/* Today's revenue by source — moved from Daily Collections */}
      <div>
        <p className="mb-2 text-sm font-semibold">Today's revenue by source</p>
        <div className="grid gap-4 md:grid-cols-3">
          <SourceCard icon={Stethoscope} label="OPD / Consultations" data={collQ.data?.opd} />
          <SourceCard icon={FlaskConical} label="Laboratory" data={collQ.data?.lab} />
          <SourceCard icon={Pill} label="Pharmacy" data={collQ.data?.pharmacy} />
        </div>
      </div>


      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <p className="mb-1 text-xs font-medium">Select doctor</p>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Pick a doctor" /></SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.doctor_id} value={d.doctor_id}>
                    {d.name}{d.specialization ? ` · ${d.specialization}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-9 w-56 pl-7" />
          </div>
        </div>

        {current && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Stat icon={Receipt} label="Today" value={`Rs ${current.today_earnings.toLocaleString()}`} />
              <Stat icon={TrendingUp} label="Last 7 days" value={`Rs ${current.week_earnings.toLocaleString()}`} />
              <Stat icon={Wallet} label="Cash" value={`Rs ${current.cash_earnings.toLocaleString()}`} />
              <Stat icon={BanknoteIcon} label="Online" value={`Rs ${current.online_earnings.toLocaleString()}`} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Stat icon={Users} label="Appointments" value={current.appointments_count} />
              <Stat icon={Users} label="Paid" value={current.paid_count} />
              <Stat icon={Users} label="Pending" value={current.pending_count} />
            </div>

            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold">Last 7 days — {current.name}</p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={days.map((d: string, i: number) => ({ day: d.slice(5), value: current.series[i] || 0 }))}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                      formatter={(v: any) => [`Rs ${Number(v).toLocaleString()}`, "Earnings"]} />
                    <Area type="monotone" dataKey="value" stroke="var(--primary)" fill="url(#g1)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b p-4">
          <p className="text-sm font-semibold">All doctors</p>
          <p className="text-xs text-muted-foreground">Click any row to switch the chart above.</p>
        </div>
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No doctors found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2">Doctor</th>
              <th className="px-4 py-2">Today</th>
              <th className="px-4 py-2">7 days</th>
              <th className="px-4 py-2">Cash</th>
              <th className="px-4 py-2">Online</th>
              <th className="px-4 py-2">Paid</th>
              <th className="px-4 py-2">Pending</th>
            </tr></thead>
            <tbody>
              {filtered.map((row: any) => (
                <tr key={row.doctor_id} onClick={() => setSelectedId(row.doctor_id)}
                  className={`cursor-pointer border-b last:border-0 hover:bg-secondary/40 ${row.doctor_id === selectedId ? "bg-primary-soft/40" : ""}`}>
                  <td className="px-4 py-2">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">{row.specialization || "—"} · Fee Rs {row.consultation_fee.toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-2 font-mono">Rs {row.today_earnings.toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">Rs {row.week_earnings.toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">Rs {row.cash_earnings.toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">Rs {row.online_earnings.toLocaleString()}</td>
                  <td className="px-4 py-2"><Badge>{row.paid_count}</Badge></td>
                  <td className="px-4 py-2"><Badge variant="secondary">{row.pending_count}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function SourceCard({ icon: Icon, label, data }: { icon: any; label: string; data?: { total: number; cash: number; online: number; other: number; count: number } }) {
  const d = data ?? { total: 0, cash: 0, online: 0, other: 0, count: 0 };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold">{label}</p>
        </div>
        <Badge variant="outline">{d.count}</Badge>
      </div>
      <p className="mt-3 text-2xl font-bold">Rs {Number(d.total).toLocaleString()}</p>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Wallet className="h-3 w-3" /> Cash</span>
          <span className="font-mono">Rs {Number(d.cash).toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><CreditCard className="h-3 w-3" /> Online</span>
          <span className="font-mono">Rs {Number(d.online).toLocaleString()}</span>
        </div>
        {d.other > 0 && (
          <div className="flex items-center justify-between">
            <span>Other</span>
            <span className="font-mono">Rs {Number(d.other).toLocaleString()}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
