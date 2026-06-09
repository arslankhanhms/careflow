import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, LogOut, Receipt, TrendingUp as TrendingUpIcon, Wallet, BanknoteIcon, Users,
  CalendarDays, LayoutDashboard, FlaskConical, Pill, Stethoscope, Sparkles, MessageSquare,
} from "lucide-react";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { DoctorAiAssistant } from "@/components/doctor-ai-assistant";
import { useAuth } from "@/hooks/use-auth";
import { getMyDoctorEarnings } from "@/lib/dashboard.functions";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/doctor/earnings")({
  head: () => ({ meta: [{ title: "My earnings — Doctor" }] }),
  component: DoctorEarningsPage,
});

function DoctorEarningsPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const fn = useServerFn(getMyDoctorEarnings);
  const qc = useQueryClient();

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("doctor-earnings-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => qc.invalidateQueries({ queryKey: ["my-earnings"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-earnings"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders", filter: `referring_doctor_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-earnings"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_dispenses", filter: `referring_doctor_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-earnings"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const q = useQuery({
    queryKey: ["my-earnings"],
    queryFn: () => fn(),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  if (loading || q.isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const d: any = q.data ?? {
    days: [] as string[],
    series: [] as number[],
    totals: { today: 0, week: 0, month: 0, total: 0, cash: 0, online: 0, consultations: 0, labCommission: 0, pharmacyCommission: 0, grandTotal: 0 },
    counts: { appts: 0, paid: 0, pending: 0 },
    paidConsultations: [],
    labReferrals: [],
    pharmacyReferrals: [],
  };

  const sidebar: SidebarSection[] = [{
    items: [
      { label: "Overview", to: "/doctor/overview", icon: LayoutDashboard },
      { label: "Today's Appointments", to: "/doctor/appointments", icon: CalendarDays },
      { label: "My Schedule", to: "/doctor/schedule", icon: LayoutDashboard },
      { label: "My Patients", to: "/doctor/patients", icon: Stethoscope },
      { label: "Patient Reports", to: "/doctor/reports", icon: FlaskConical },
      { label: "Closure Requests", to: "/doctor/closures", icon: Receipt },
      { label: "My Earnings", to: "/doctor/earnings", icon: TrendingUpIcon },
      { label: "Messages", to: "/doctor/messages", icon: MessageSquare },
      { label: "AI Assistant", to: "/doctor/ai-assistant", icon: Sparkles },
    ],
  }];
  const sidebarFooter = (
    <Button size="sm" variant="outline" className="w-full" onClick={signOut}>
      <LogOut className="mr-1.5 h-3 w-3" /> Sign out
    </Button>
  );
  const topbarRight = <Badge variant="outline" className="capitalize text-[10px]">Doctor</Badge>;

  const chartData = (d.days as string[]).map((day: string, i: number) => ({ day: day.slice(5), value: d.series[i] || 0 }));

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar sections={sidebar} footer={sidebarFooter} />
      <div className="flex flex-1 flex-col">
        <AppTopbar title="My earnings" subtitle={user?.email ?? undefined} right={topbarRight} />
        <main className="mx-auto w-full max-w-6xl space-y-5 p-6">
          <div>
            <h1 className="text-2xl font-bold">My earnings</h1>
            <p className="text-sm text-muted-foreground">Live revenue from your consultations. Updates instantly as payments are marked paid or refunded.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat icon={Receipt} label="Today" value={`Rs ${(d.totals.today || 0).toLocaleString()}`} />
            <Stat icon={TrendingUpIcon} label="Last 7 days" value={`Rs ${(d.totals.week || 0).toLocaleString()}`} />
            <Stat icon={Wallet} label="Cash" value={`Rs ${(d.totals.cash || 0).toLocaleString()}`} />
            <Stat icon={BanknoteIcon} label="Online" value={`Rs ${(d.totals.online || 0).toLocaleString()}`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat icon={TrendingUpIcon} label="Last 30 days" value={`Rs ${(d.totals.month || 0).toLocaleString()}`} />
            <Stat icon={Users} label="Appointments" value={d.counts.appts ?? 0} />
            <Stat icon={Users} label="Paid" value={d.counts.paid ?? 0} />
            <Stat icon={Users} label="Pending" value={d.counts.pending ?? 0} />
          </div>

          {/* Multi-source revenue summary */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat icon={Receipt} label="Consultations" value={`Rs ${Number(d.totals.consultations || 0).toLocaleString()}`} />
            <Stat icon={FlaskConical} label="Lab commission" value={`Rs ${Number(d.totals.labCommission || 0).toLocaleString()}`} />
            <Stat icon={Pill} label="Pharmacy commission" value={`Rs ${Number(d.totals.pharmacyCommission || 0).toLocaleString()}`} />
            <Stat icon={TrendingUpIcon} label="Grand total" value={`Rs ${Number(d.totals.grandTotal || 0).toLocaleString()}`} />
          </div>

          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Last 30 days earnings</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="dg1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} interval={3} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    formatter={(v: any) => [`Rs ${Number(v).toLocaleString()}`, "Earnings"]} />
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" fill="url(#dg1)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-0">
            <div className="border-b p-4">
              <h2 className="text-lg font-semibold">Paid consultations</h2>
              <p className="text-xs text-muted-foreground">All payments received against your appointments · most recent first.</p>
            </div>
            {d.paidConsultations.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No paid consultations yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Patient</th>
                      <th className="px-4 py-2 text-left">Method</th>
                      <th className="px-4 py-2 text-left">Receipt</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {d.paidConsultations.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2 whitespace-nowrap">{new Date(p.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                        <td className="px-4 py-2">{p.patient}</td>
                        <td className="px-4 py-2 capitalize">{p.method}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{p.receipt_no ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-semibold">Rs {p.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Lab referral commission */}
          <Card className="p-0">
            <div className="border-b p-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" /> Lab referral commission</h2>
              <p className="text-xs text-muted-foreground">Commission earned on lab tests you referred.</p>
            </div>
            {d.labReferrals.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No lab referrals yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Tests</th><th className="px-4 py-2 text-right">Bill</th><th className="px-4 py-2 text-right">%</th><th className="px-4 py-2 text-right">Commission</th></tr>
                </thead>
                <tbody className="divide-y">
                  {d.labReferrals.slice(0, 20).map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 whitespace-nowrap">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-xs">{r.tests || "—"}</td>
                      <td className="px-4 py-2 text-right">Rs {r.amount.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">{r.percent}%</td>
                      <td className="px-4 py-2 text-right font-semibold">Rs {Math.round(r.commission).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Pharmacy referral commission */}
          <Card className="p-0">
            <div className="border-b p-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Pill className="h-4 w-4 text-primary" /> Pharmacy referral commission</h2>
              <p className="text-xs text-muted-foreground">Commission earned on prescriptions dispensed via the hospital pharmacy.</p>
            </div>
            {d.pharmacyReferrals.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No pharmacy referrals yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">Bill</th><th className="px-4 py-2 text-right">%</th><th className="px-4 py-2 text-right">Commission</th></tr>
                </thead>
                <tbody className="divide-y">
                  {d.pharmacyReferrals.slice(0, 20).map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 whitespace-nowrap">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-right">Rs {r.amount.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">{r.percent}%</td>
                      <td className="px-4 py-2 text-right font-semibold">Rs {Math.round(r.commission).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </main>
      </div>
      <DoctorAiAssistant />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </Card>
  );
}
