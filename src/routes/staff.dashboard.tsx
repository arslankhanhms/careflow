import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, LogOut, FlaskConical, Pill, BedDouble, Users, Receipt, Stethoscope, Building2, Search, LayoutDashboard, CalendarDays, Bell, MessageSquare, Settings, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getStaffDashboard, getMyRoleContext, getDoctorEarnings } from "@/lib/dashboard.functions";
import { useState } from "react";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";



export const Route = createFileRoute("/staff/dashboard")({
  head: () => ({ meta: [{ title: "Staff dashboard — MediFlow AI" }] }),
  component: StaffDashboardPage,
});

function StaffDashboardPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const fnDash = useServerFn(getStaffDashboard);
  const fnCtx = useServerFn(getMyRoleContext);

  const qc = useQueryClient();
  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [user, loading]);

  // Realtime: refresh dashboard whenever payments / appointments / patients change
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("staff-dash-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => { qc.invalidateQueries({ queryKey: ["staff-dash"] }); qc.invalidateQueries({ queryKey: ["doc-earnings"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" },
        () => { qc.invalidateQueries({ queryKey: ["staff-dash"] }); qc.invalidateQueries({ queryKey: ["doc-earnings"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" },
        () => qc.invalidateQueries({ queryKey: ["staff-dash"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" },
        () => qc.invalidateQueries({ queryKey: ["doc-earnings"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_dispenses" },
        () => qc.invalidateQueries({ queryKey: ["doc-earnings"] }))
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const ctxQ = useQuery({ queryKey: ["my-role-ctx"], queryFn: () => fnCtx(), enabled: !!user });
  const dashQ = useQuery({ queryKey: ["staff-dash"], queryFn: () => fnDash(), enabled: !!user });

  if (loading || ctxQ.isLoading || dashQ.isLoading)
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const ctx = ctxQ.data;
  const data: any = dashQ.data ?? {};
  const role = data.role || ctx?.role;

  if (!role) {
    return (
      <CenterCard>
        <p className="text-sm">Your account has no hospital role assigned. Ask your hospital admin to invite you.</p>
        <Button asChild className="mt-4"><Link to="/login">Sign out</Link></Button>
      </CenterCard>
    );
  }

  // Hospital admin → full workspace
  if (role === "hospital_admin" && ctx?.slug) {
    return <Navigate to="/hospital/$slug/" params={{ slug: ctx.slug }} replace />;
  }
  // Doctor → doctor appointments page
  if (role === "doctor") {
    return <Navigate to="/doctor/appointments" replace />;
  }
  // Receptionist / Accountant → full hospital workspace (with complete sidebar)
  if ((role === "receptionist" || role === "accountant") && ctx?.slug) {
    return <Navigate to="/hospital/$slug/" params={{ slug: ctx.slug }} replace />;
  }
  // Lab tech / Pharmacist → their primary module
  if (role === "lab_tech" && ctx?.slug) return <Navigate to="/hospital/$slug/lab" params={{ slug: ctx.slug }} replace />;
  if (role === "pharmacist" && ctx?.slug) return <Navigate to="/hospital/$slug/pharmacy" params={{ slug: ctx.slug }} replace />;

  const slug = ctx?.slug;
  const isReceptionist = role === "receptionist" || role === "accountant";
  const isLabTech = role === "lab_tech";
  const isPharmacist = role === "pharmacist";
  const isNurse = role === "nurse";
  const sidebar: SidebarSection[] = [{
    items: [
      { label: "Dashboard", to: "/staff/dashboard", icon: LayoutDashboard },
      ...(slug ? [
        ...(isReceptionist ? [
          { label: "Appointments", to: "/hospital/$slug/appointments", params: { slug }, icon: CalendarDays },
          { label: "Patients", to: "/hospital/$slug/patients", params: { slug }, icon: Users },
          { label: "Doctor schedules", to: "/hospital/$slug/doctor-schedules", params: { slug }, icon: CalendarDays },
          { label: "Earnings", to: "/hospital/$slug/earnings", params: { slug }, icon: TrendingUp },
          { label: "Billing", to: "/hospital/$slug/billing", params: { slug }, icon: Receipt },
        ] : []),
        ...(isLabTech ? [
          { label: "Lab Orders", to: "/hospital/$slug/lab", params: { slug }, icon: FlaskConical },
        ] : []),
        ...(isPharmacist ? [
          { label: "Pharmacy", to: "/hospital/$slug/pharmacy", params: { slug }, icon: Pill },
        ] : []),
        ...(isNurse ? [
          { label: "Patients", to: "/hospital/$slug/patients", params: { slug }, icon: Users },
          { label: "OPD / Ward", to: "/hospital/$slug/opd", params: { slug }, icon: Stethoscope },
          { label: "Day Care", to: "/hospital/$slug/daycare", params: { slug }, icon: BedDouble },
        ] : []),
        { label: "Messages", to: "/hospital/$slug/messages", params: { slug }, icon: MessageSquare },
        { label: "Notifications", to: "/hospital/$slug/notifications", params: { slug }, icon: Bell },
      ] : []),
    ],
  }];
  const sidebarFooter = (
    <Button size="sm" variant="outline" className="w-full" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
      <LogOut className="mr-1.5 h-3 w-3" /> Sign out
    </Button>
  );
  const topbarRight = <Badge variant="outline" className="capitalize text-[10px]">{role.replace("_"," ")}</Badge>;

  return (
    <div className="flex min-h-screen w-full bg-secondary/30">
      <AppSidebar sections={sidebar} footer={sidebarFooter} />
      <div className="flex flex-1 flex-col">
        <AppTopbar
          title={`${role.replace("_"," ")} dashboard`}
          subtitle={user?.email ?? undefined}
          right={topbarRight}
        />
        <main className="mx-auto w-full max-w-6xl space-y-5 p-6">
          {role === "receptionist" || role === "accountant" ? (
            <ReceptionistView d={data} />
          ) : role === "lab_tech" ? (
            <LabTechView d={data} slug={ctx?.slug} />
          ) : role === "pharmacist" ? (
            <PharmacistView d={data} slug={ctx?.slug} />
          ) : role === "nurse" ? (
            <NurseView d={data} slug={ctx?.slug} />
          ) : (
            <Card className="p-6 text-sm text-muted-foreground">No tailored dashboard for this role yet.</Card>
          )}
        </main>
      </div>
    </div>
  );
}


function CenterCard({ children }: any) {
  return <div className="grid min-h-screen place-items-center p-6"><Card className="max-w-md p-6">{children}</Card></div>;
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

function ReceptionistView({ d }: { d: any }) {
  const rev = d.revenue ?? { total: 0, cash: 0, online: 0, week: 0 };
  const fnDocs = useServerFn(getDoctorEarnings);
  const docsQ = useQuery({ queryKey: ["doc-earnings"], queryFn: () => fnDocs(), refetchInterval: 30_000 });
  const [search, setSearch] = useState("");
  const docs = (docsQ.data?.doctors ?? []) as any[];
  const filtered = search.trim()
    ? docs.filter((d) => (d.name || "").toLowerCase().includes(search.trim().toLowerCase())
        || (d.specialization || "").toLowerCase().includes(search.trim().toLowerCase()))
    : docs;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Users} label="Today's appointments" value={d.appointments?.length ?? 0} />
        <Stat icon={Receipt} label="Today's revenue" value={`Rs ${Number(rev.total).toLocaleString()}`} hint="Live · updates on payment" />
        <Stat icon={TrendingUp} label="Last 7 days" value={`Rs ${Number(rev.week ?? 0).toLocaleString()}`} hint="Rolling week · live" />
        <Stat icon={Receipt} label="Cash" value={`Rs ${Number(rev.cash).toLocaleString()}`} hint="Counter collections" />
        <Stat icon={Receipt} label="Online" value={`Rs ${Number(rev.online).toLocaleString()}`} hint="Easypaisa / JazzCash / Bank" />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div>
            <p className="text-sm font-semibold">Doctor earnings</p>
            <p className="text-xs text-muted-foreground">Per-doctor revenue, today's earnings and appointment status.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search doctor…" className="h-8 w-56 pl-7 text-xs" />
          </div>
        </div>
        {docsQ.isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No doctors found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2">Doctor</th>
              <th className="px-4 py-2">Today</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Appts</th>
              <th className="px-4 py-2">Paid</th>
              <th className="px-4 py-2">Pending</th>
            </tr></thead>
            <tbody>
              {filtered.map((row: any) => (
                <tr key={row.doctor_id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">{row.specialization || "—"} · Fee Rs {row.consultation_fee.toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-2 font-mono">Rs {row.today_earnings.toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">Rs {row.total_earnings.toLocaleString()}</td>
                  <td className="px-4 py-2">{row.appointments_count}</td>
                  <td className="px-4 py-2"><Badge variant="default" className="text-[10px]">{row.paid_count}</Badge></td>
                  <td className="px-4 py-2"><Badge variant="secondary" className="text-[10px]">{row.pending_count}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b p-4"><p className="text-sm font-semibold">Today's payments</p></div>
        {(d.payments ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No payments yet today.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="px-4 py-2">Patient</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Method</th><th className="px-4 py-2">Receipt</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>
              {(d.payments).map((p: any) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{p.patient?.first_name} {p.patient?.last_name}</td>
                  <td className="px-4 py-2 font-mono">Rs {Number(p.amount).toLocaleString()}</td>
                  <td className="px-4 py-2 capitalize">{p.method}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.receipt_no ?? "—"}</td>
                  <td className="px-4 py-2"><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b p-4"><p className="text-sm font-semibold">Appointments today</p></div>
        {(d.appointments ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No appointments scheduled.</p>
        ) : (
          <div className="divide-y">
            {d.appointments.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <span className="font-mono text-xs">#{a.queue_no ?? "-"}</span>
                  <span className="ml-2 font-semibold">{a.patient?.first_name} {a.patient?.last_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{a.patient?.mrn} · {new Date(a.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                  <Badge variant={a.payment_status === "paid" ? "default" : "secondary"} className="text-[10px]">{a.payment_status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b p-4"><p className="text-sm font-semibold">New patient registrations today</p></div>
        {(d.newPatients ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No new patients yet today.</p>
        ) : (
          <div className="divide-y">
            {d.newPatients.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                <span className="font-semibold">{p.first_name} {p.last_name}</span>
                <span className="font-mono text-xs text-muted-foreground">{p.mrn}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}


function LabTechView({ d, slug }: { d: any; slug: string | null | undefined }) {
  const orders = d.orders ?? [];
  const urgent = orders.filter((o: any) => o.priority === "urgent" || o.priority === "stat").length;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={FlaskConical} label="Pending orders" value={orders.length} />
        <Stat icon={FlaskConical} label="Urgent / STAT" value={urgent} />
        <Card className="p-4 flex items-center justify-between">
          <p className="text-sm">Open full lab module</p>
          {slug && <Button size="sm" asChild><Link to="/hospital/$slug/lab" params={{ slug }}>Open</Link></Button>}
        </Card>
      </div>
      <Card className="p-0">
        <div className="border-b p-4"><p className="text-sm font-semibold">Incoming lab orders</p><p className="text-xs text-muted-foreground">Urgent first</p></div>
        {orders.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No pending orders.</p>
        ) : (
          <div className="divide-y">
            {orders.map((o: any) => (
              <div key={o.id} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{o.patient?.first_name} {o.patient?.last_name} <span className="font-normal text-muted-foreground text-xs">· {o.patient?.mrn}</span></p>
                    <p className="text-xs text-muted-foreground">{(o.tests ?? []).join(", ")}{o.department && ` · ${o.department}`}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={o.priority === "urgent" || o.priority === "stat" ? "destructive" : "outline"} className="text-[10px] capitalize">{o.priority}</Badge>
                    <Badge variant="outline" className="text-[10px]">{o.status.replace("_"," ")}</Badge>
                  </div>
                </div>
                {o.notes && <p className="mt-1 text-xs italic text-muted-foreground">"{o.notes}"</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function PharmacistView({ d, slug }: { d: any; slug: string | null | undefined }) {
  const rx = d.prescriptions ?? [];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Pill} label="Recent prescriptions" value={rx.length} hint="Last 48 hours" />
        <Card className="p-4 flex items-center justify-between">
          <p className="text-sm">Open pharmacy</p>
          {slug && <Button size="sm" asChild><Link to="/hospital/$slug/pharmacy" params={{ slug }}>Open</Link></Button>}
        </Card>
      </div>
      <Card className="p-0">
        <div className="border-b p-4"><p className="text-sm font-semibold">Prescriptions to dispense</p></div>
        {rx.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No new prescriptions.</p>
        ) : (
          <div className="divide-y">
            {rx.map((r: any) => (
              <div key={r.id} className="p-3 text-sm">
                <p className="font-semibold">{r.patient?.first_name} {r.patient?.last_name} <span className="text-xs text-muted-foreground">· {r.patient?.mrn}</span></p>
                <p className="text-xs text-muted-foreground">{r.diagnosis || "—"} · {new Date(r.issued_at).toLocaleString()}</p>
                {Array.isArray(r.medications) && r.medications.length > 0 && (
                  <ul className="mt-1 ml-4 list-disc text-xs">
                    {r.medications.map((m: any, i: number) => <li key={i}>{m.name}{m.dose ? ` · ${m.dose}` : ""}{m.frequency ? ` · ${m.frequency}` : ""}{m.duration ? ` · ${m.duration}` : ""}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function NurseView({ d, slug }: { d: any; slug: string | null | undefined }) {
  const beds = d.beds ?? []; const adm = d.admissions ?? [];
  const occupied = beds.filter((b: any) => b.status === "occupied").length;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={BedDouble} label="Beds occupied" value={`${occupied}/${beds.length}`} />
        <Stat icon={Users} label="Active admissions" value={adm.length} />
        <Card className="p-4 flex items-center justify-between">
          <p className="text-sm">Open OPD / Ward</p>
          {slug && <Button size="sm" asChild><Link to="/hospital/$slug/opd" params={{ slug }}>Open</Link></Button>}
        </Card>
      </div>
      <Card className="p-0">
        <div className="border-b p-4"><p className="text-sm font-semibold">Active admissions</p></div>
        {adm.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No active admissions.</p>
        ) : (
          <div className="divide-y">
            {adm.map((a: any) => (
              <div key={a.id} className="p-3 text-sm">
                <p className="font-semibold">{a.patient?.first_name} {a.patient?.last_name} <span className="text-xs text-muted-foreground">· {a.patient?.mrn}</span></p>
                <p className="text-xs text-muted-foreground">{a.diagnosis || "—"} · admitted {new Date(a.admitted_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
