import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getHospitalBySlugPublic } from "@/lib/public-hospital.functions";
import { getStaffDashboard, getDoctorEarnings, getMyDoctorEarnings } from "@/lib/dashboard.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Users, Calendar, Receipt, Sparkles, ArrowRight, Loader2,
  CheckCircle2, Hourglass, CreditCard, Banknote, FlaskConical, MessageSquare, Pill, TrendingUp, Wallet,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/hospital/$slug/")({
  loader: async ({ params }) => {
    const { hospital } = await getHospitalBySlugPublic({ data: { slug: params.slug } });
    if (!hospital) throw notFound();
    return { hospital };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.hospital.name ?? "Hospital"} — MediFlow AI` }],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md p-8 text-center">
        <h2 className="text-xl font-semibold">Hospital not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">No workspace exists for that slug.</p>
        <Button asChild className="mt-4"><Link to="/">Back home</Link></Button>
      </Card>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
  component: HospitalOverview,
});

function HospitalOverview() {
  const { slug } = Route.useParams();
  const { hospital } = Route.useLoaderData();
  const { user } = useAuth();
  const fnDash = useServerFn(getStaffDashboard);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["staff-dashboard", slug],
    queryFn: () => fnDash({}),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Realtime: refresh dashboard when payments/appointments/concessions change
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`hosp-overview-${slug}-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => qc.invalidateQueries({ queryKey: ["staff-dashboard", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" },
        () => qc.invalidateQueries({ queryKey: ["staff-dashboard", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "concession_requests" },
        () => { qc.invalidateQueries({ queryKey: ["staff-dashboard", slug] }); qc.invalidateQueries({ queryKey: ["doctor-earnings", slug] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, slug, qc]);


  return (
    <>
      <AppTopbar
        title={hospital.name}
        subtitle={`${hospital.city} · ${hospital.plan} plan`}
      />
      <div className="space-y-6 p-6">
        {q.isLoading && (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your dashboard…
          </div>
        )}
        {q.data && <RoleOverview slug={slug} data={q.data as any} />}
      </div>
    </>
  );
}

function RoleOverview({ slug, data }: { slug: string; data: any }) {
  if (data.role === "doctor") return <DoctorOverview slug={slug} data={data} />;
  if (data.role === "hospital_admin" || data.role === "owner" || data.role === "receptionist" || data.role === "accountant")
    return <AdminOverview slug={slug} data={data} />;
  if (data.role === "lab_tech") return <SimpleList title="Active lab orders" rows={(data.orders ?? []).map((o: any) => ({
    primary: `${o.patient?.first_name ?? ""} ${o.patient?.last_name ?? ""}`.trim() || "Patient",
    secondary: `${(o.tests ?? []).join(", ")} · ${o.priority}`, badge: o.status,
  }))} />;
  if (data.role === "pharmacist") return <SimpleList title="Recent prescriptions" rows={(data.prescriptions ?? []).map((p: any) => ({
    primary: `${p.patient?.first_name ?? ""} ${p.patient?.last_name ?? ""}`.trim() || "Patient",
    secondary: p.diagnosis || `${(p.medications ?? []).length} medication(s)`,
    badge: new Date(p.issued_at).toLocaleDateString(),
  }))} />;
  if (data.role === "nurse") return <SimpleList title="Active admissions" rows={(data.admissions ?? []).map((a: any) => ({
    primary: `${a.patient?.first_name ?? ""} ${a.patient?.last_name ?? ""}`.trim() || "Patient",
    secondary: a.diagnosis || "Admitted", badge: new Date(a.admitted_at).toLocaleDateString(),
  }))} />;
  return <p className="text-sm text-muted-foreground">No dashboard view for this role.</p>;
}

function DoctorOverview({ slug, data }: { slug: string; data: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fnEarn = useServerFn(getMyDoctorEarnings);
  const [openEarn, setOpenEarn] = useState(false);
  const earningsQ = useQuery({
    queryKey: ["my-earnings", slug],
    queryFn: () => fnEarn(),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`doc-notifs-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload: any) => {
        const n = payload.new;
        if (n?.type === "lab_result") toast.success(n.title || "Lab results available", { description: n.body });
        if (n?.type === "prescription.dispensed") toast.info(n.title || "Prescription dispensed", { description: n.body });
        if (n?.type === "concession.approved") toast.success(n.title || "Concession approved", { description: n.body });
        if (n?.type === "concession.rejected") toast.error(n.title || "Concession rejected", { description: n.body });
        qc.invalidateQueries({ queryKey: ["staff-dashboard", slug] });
        qc.invalidateQueries({ queryKey: ["my-earnings", slug] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => qc.invalidateQueries({ queryKey: ["my-earnings", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-earnings", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "concession_requests", filter: `doctor_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-earnings", slug] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, slug, qc]);

  const appts = (data.appointments ?? []) as any[];
  const inQueue = appts.filter((a) => ["scheduled", "checked-in", "in-consult", "checked_in", "in_progress"].includes(a.status)).length;
  const completed = appts.filter((a) => a.status === "completed").length;
  const paid = appts.filter((a) => a.payment_status === "paid").length;
  const e: any = earningsQ.data ?? { days: [], series: [], totals: {} };
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <button type="button" onClick={() => setOpenEarn(true)} className="text-left">
          <Stat icon={TrendingUp} label="Today's earnings" value={`Rs ${(e.totals.today || 0).toLocaleString()}`} hint="Click for 7-day breakdown" />
        </button>
        <Stat icon={Banknote} label="Last 7 days" value={`Rs ${(e.totals.week || 0).toLocaleString()}`} hint="Your paid revenue" />
        <Stat icon={Wallet} label="Cash" value={`Rs ${(e.totals.cash || 0).toLocaleString()}`} hint="Cash collected" />
        <Stat icon={CreditCard} label="Online" value={`Rs ${(e.totals.online || 0).toLocaleString()}`} hint="Online collected" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Users} label="My patients today" value={String(appts.length)} hint="Only your appointments" />
        <Stat icon={Hourglass} label="In queue now" value={String(inQueue)} hint="Waiting / in consult" />
        <Stat icon={CheckCircle2} label="Completed" value={String(completed)} hint="Today" />
        <Stat icon={CreditCard} label="Paid" value={`${paid}/${appts.length}`} hint="Online or cash" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <ShortcutCard slug={slug} to="/hospital/$slug/ai" icon={Sparkles} label="AI Assistant" hint="Ask · interpret reports" />
        <ShortcutCard slug={slug} to="/hospital/$slug/lab" icon={FlaskConical} label="Lab orders" hint="Order · view results" />
        <ShortcutCard slug={slug} to="/hospital/$slug/patients" icon={Pill} label="Prescribe" hint="Issue prescription" />
        <ShortcutCard slug={slug} to="/hospital/$slug/messages" icon={MessageSquare} label="Messages" hint="Patient & team" />
      </div>

      <Dialog open={openEarn} onOpenChange={setOpenEarn}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>My earnings · last 7 days</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat icon={TrendingUp} label="Today" value={`Rs ${(e.totals.today || 0).toLocaleString()}`} />
            <Stat icon={Banknote} label="7 days" value={`Rs ${(e.totals.week || 0).toLocaleString()}`} />
            <Stat icon={Wallet} label="Cash" value={`Rs ${(e.totals.cash || 0).toLocaleString()}`} />
            <Stat icon={CreditCard} label="Online" value={`Rs ${(e.totals.online || 0).toLocaleString()}`} />
          </div>
          <div className="mt-2">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Daily breakdown</p>
            <ul className="divide-y rounded-md border text-sm">
              {(e.days || []).map((d: string, i: number) => (
                <li key={d} className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">{d}</span>
                  <span className="font-mono font-medium">Rs {Number(e.series?.[i] || 0).toLocaleString()}</span>
                </li>
              ))}
              {(!e.days || e.days.length === 0) && (
                <li className="px-3 py-6 text-center text-muted-foreground">No earnings yet.</li>
              )}
            </ul>
          </div>
          <DialogFooter>
            <Button asChild variant="outline" size="sm">
              <Link to="/doctor/earnings">Open full earnings page <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Your queue · today</h3>
          <Button asChild size="sm" variant="ghost">
            <Link to="/hospital/$slug/schedule" params={{ slug }}>Open my schedule <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        </div>
        {appts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No appointments scheduled for you today.</p>
        ) : (
          <ul className="divide-y text-sm">
            {appts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-10 text-center font-mono text-xs text-muted-foreground">#{a.queue_no ?? "—"}</span>
                  <div>
                    <p className="font-medium">{a.patient?.first_name} {a.patient?.last_name}</p>
                    <p className="text-xs text-muted-foreground">{a.patient?.mrn} · {new Date(a.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentBadge status={a.payment_status} />
                  <Badge variant="outline" className="capitalize">{a.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function AdminOverview({ slug, data }: { slug: string; data: any }) {
  const appts = (data.appointments ?? []) as any[];
  const pays = (data.payments ?? []) as any[];
  const newPts = (data.newPatients ?? []) as any[];
  const rev = data.revenue ?? { total: 0, cash: 0, online: 0 };
  const fnEarnings = useServerFn(getDoctorEarnings);
  const earningsQ = useQuery({
    queryKey: ["doctor-earnings", slug],
    queryFn: () => fnEarnings({}),
    refetchInterval: 30_000,
  });
  const chartData = (((earningsQ.data as any)?.doctors ?? []) as any[])
    .slice(0, 8)
    .map((d) => ({ name: (d.name || "—").split(" ").slice(0, 2).join(" "), today: d.today_earnings, total: d.total_earnings }));
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Users} label="New patients today" value={String(newPts.length)} hint="Registered today" />
        <Stat icon={Calendar} label="Appointments today" value={String(appts.length)} hint={`${appts.filter((a) => a.status === "completed").length} completed`} />
        <Stat
          icon={Receipt}
          label="Revenue today"
          value={`Rs ${Number(rev.total).toLocaleString()}`}
          hint={
            rev.concession_today
              ? `Gross Rs ${Number(rev.gross_total ?? rev.total).toLocaleString()} − Concession Rs ${Number(rev.concession_today).toLocaleString()}`
              : `Cash Rs ${Number(rev.cash).toLocaleString()} · Online Rs ${Number(rev.online).toLocaleString()}`
          }
        />
        <Stat icon={Banknote} label="Last 7 days" value={`Rs ${Number(rev.week ?? 0).toLocaleString()}`} hint={rev.concession_week ? `After Rs ${Number(rev.concession_week).toLocaleString()} concession` : "Rolling week · live"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Today's appointments</h3>
          {appts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No appointments today.</p>
          ) : (
            <ul className="divide-y text-sm">
              {appts.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">{a.patient?.first_name} {a.patient?.last_name}</p>
                    <p className="text-xs text-muted-foreground">{a.patient?.mrn} · {new Date(a.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div className="flex items-center gap-2"><PaymentBadge status={a.payment_status} /><Badge variant="outline" className="capitalize">{a.status}</Badge></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Recent payments</h3>
          {pays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments today.</p>
          ) : (
            <ul className="divide-y text-sm">
              {pays.slice(0, 10).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">{p.patient?.first_name} {p.patient?.last_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{p.method} · {p.receipt_no ?? "—"}</p>
                  </div>
                  <span className="font-semibold">Rs {Number(p.amount).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Doctor earnings</h3>
            <p className="text-xs text-muted-foreground">Today vs all-time, per doctor (top 8)</p>
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {earningsQ.isLoading ? "Loading…" : "No doctor earnings recorded yet."}
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rs ${Number(v).toLocaleString()}`} width={80} />
                <Tooltip formatter={(v: any) => `Rs ${Number(v).toLocaleString()}`} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="today" fill="var(--primary)" name="Today" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" fill="var(--muted-foreground)" name="All time" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </>
  );
}

function SimpleList({ title, rows }: { title: string; rows: { primary: string; secondary: string; badge?: string }[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p> : (
        <ul className="divide-y text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <div><p className="font-medium">{r.primary}</p><p className="text-xs text-muted-foreground">{r.secondary}</p></div>
              {r.badge && <Badge variant="outline" className="capitalize">{r.badge}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PaymentBadge({ status }: { status?: string }) {
  if (status === "paid") return <Badge className="bg-success/10 text-success border-success/30" variant="outline">Paid</Badge>;
  return <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning-foreground">Unpaid</Badge>;
}

function Stat({ icon: Icon, label, value, hint }: any) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="rounded-md bg-primary-soft p-1.5"><Icon className="h-4 w-4 text-primary" /></div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function ShortcutCard({ slug, to, icon: Icon, label, hint }: any) {
  return (
    <Link to={to} params={{ slug } as any} className="block">
      <Card className="flex items-center gap-3 p-4 transition hover:border-primary hover:bg-secondary/40">
        <div className="rounded-md bg-primary-soft p-2"><Icon className="h-4 w-4 text-primary" /></div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </Card>
    </Link>
  );
}
