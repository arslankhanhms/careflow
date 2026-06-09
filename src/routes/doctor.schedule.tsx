import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarClock, Users, DollarSign, Save, LogOut, TrendingUp, CalendarDays, LayoutDashboard, Stethoscope, Sparkles, MessageSquare, FileText, Plane, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { DoctorAiAssistant } from "@/components/doctor-ai-assistant";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMySchedule, updateMySchedule, getMyTodayQueue, recordPayment } from "@/lib/schedule.functions";
import { updateAppointmentStatus } from "@/lib/appointments.functions";
import { getMyDoctorEarnings } from "@/lib/dashboard.functions";
import { listDoctorLeaves, createDoctorLeave, cancelDoctorLeave } from "@/lib/leaves.functions";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/doctor/schedule")({
  head: () => ({ meta: [{ title: "My schedule & queue — MediFlow AI" }] }),
  component: DoctorSchedulePage,
});

const DAYS = [
  { k: "mon", label: "Mon" }, { k: "tue", label: "Tue" }, { k: "wed", label: "Wed" },
  { k: "thu", label: "Thu" }, { k: "fri", label: "Fri" }, { k: "sat", label: "Sat" }, { k: "sun", label: "Sun" },
];

function DoctorSchedulePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const fnGet = useServerFn(getMySchedule);
  const fnUpd = useServerFn(updateMySchedule);
  const fnQueue = useServerFn(getMyTodayQueue);
  const fnUpdAppt = useServerFn(updateAppointmentStatus);
  const fnPay = useServerFn(recordPayment);
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading]);

  const profileQ = useQuery({ queryKey: ["my-schedule"], queryFn: () => fnGet(), enabled: !!user });
  const queueQ = useQuery({ queryKey: ["my-queue"], queryFn: () => fnQueue(), enabled: !!user, refetchInterval: 15000 });
  const fnEarnings = useServerFn(getMyDoctorEarnings);
  const earningsQ = useQuery({ queryKey: ["my-earnings"], queryFn: () => fnEarnings(), enabled: !!user, refetchInterval: 30_000 });
  const [openEarnings, setOpenEarnings] = useState(false);

  // Realtime: refresh queue when appointments change for this doctor
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("doctor-queue-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${user.id}` },
        () => { qc.invalidateQueries({ queryKey: ["my-queue"] }); qc.invalidateQueries({ queryKey: ["my-earnings"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => { qc.invalidateQueries({ queryKey: ["my-queue"] }); qc.invalidateQueries({ queryKey: ["my-earnings"] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const updMut = useMutation({
    mutationFn: (d: any) => fnUpd({ data: d }),
    onSuccess: () => { toast.success("Schedule saved"); qc.invalidateQueries({ queryKey: ["my-schedule"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const apptMut = useMutation({
    mutationFn: (v: { id: string; status: any }) => fnUpdAppt({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-queue"] }),
  });
  const payMut = useMutation({
    mutationFn: (v: any) => fnPay({ data: v }),
    onSuccess: (r: any) => { toast.success(`Payment recorded · ${r.receiptNo}`); qc.invalidateQueries({ queryKey: ["my-queue"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const p = profileQ.data;
  const queue = queueQ.data ?? [];

  if (authLoading || profileQ.isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const doctorSidebar: SidebarSection[] = [{
    items: [
      { label: "Overview", to: "/doctor/overview", icon: LayoutDashboard },
      { label: "Today's Appointments", to: "/doctor/appointments", icon: CalendarDays },
      { label: "My Schedule", to: "/doctor/schedule", icon: LayoutDashboard },
      { label: "My Patients", to: "/doctor/patients", icon: Stethoscope },
      { label: "Patient Reports", to: "/doctor/reports", icon: FileText },
      { label: "Closure Requests", to: "/doctor/closures", icon: FileText },
      { label: "My Earnings", to: "/doctor/earnings", icon: TrendingUp },
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

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar sections={doctorSidebar} footer={sidebarFooter} />
      <div className="flex flex-1 flex-col">
        <AppTopbar title="My schedule & queue" subtitle={user?.email ?? undefined} right={topbarRight} />
        <main className="mx-auto w-full max-w-6xl space-y-6 p-6">

        <div>
          <h1 className="text-2xl font-bold">My schedule & queue</h1>
          <p className="text-sm text-muted-foreground">Set your availability and run today's clinic in real time.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Stat icon={Users} label="In queue today" value={String(queue.filter((q: any) => q.status === "scheduled" || q.status === "checked_in").length)} />
          <Stat icon={CalendarClock} label="Total today" value={String(queue.length)} />
          <Stat icon={DollarSign} label="Fee" value={`Rs ${Number(p?.consultation_fee || 0).toLocaleString()}`} />
          <button type="button" onClick={() => setOpenEarnings(true)} className="text-left">
            <Card className="p-4 transition hover:border-primary hover:shadow-md cursor-pointer">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Today's earnings</p>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold">Rs {Number(earningsQ.data?.totals?.today || 0).toLocaleString()}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Click for 7-day breakdown</p>
            </Card>
          </button>
        </div>

        <Dialog open={openEarnings} onOpenChange={setOpenEarnings}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>My earnings</DialogTitle></DialogHeader>
            {earningsQ.isLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Card className="p-3"><p className="text-[10px] text-muted-foreground">Today</p><p className="text-lg font-bold">Rs {Number(earningsQ.data?.totals?.today || 0).toLocaleString()}</p></Card>
                  <Card className="p-3"><p className="text-[10px] text-muted-foreground">7 days</p><p className="text-lg font-bold">Rs {Number(earningsQ.data?.totals?.week || 0).toLocaleString()}</p></Card>
                  <Card className="p-3"><p className="text-[10px] text-muted-foreground">Cash</p><p className="text-lg font-bold">Rs {Number(earningsQ.data?.totals?.cash || 0).toLocaleString()}</p></Card>
                  <Card className="p-3"><p className="text-[10px] text-muted-foreground">Online</p><p className="text-lg font-bold">Rs {Number(earningsQ.data?.totals?.online || 0).toLocaleString()}</p></Card>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Last 7 days</p>
                  <div className="space-y-1">
                    {(earningsQ.data?.days ?? []).map((d: string, i: number) => (
                      <div key={d} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span>{d}</span>
                        <span className="font-semibold">Rs {Number((earningsQ.data?.series ?? [])[i] || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Link to="/doctor/earnings"><Button variant="outline" size="sm">Open full earnings page</Button></Link>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Today's queue */}
        <Card className="p-0">
          <div className="border-b p-4"><h2 className="text-lg font-semibold">Today's queue</h2><p className="text-xs text-muted-foreground">Live · auto-refreshes</p></div>
          {queue.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No appointments scheduled today.</div>
          ) : (
            <div className="divide-y">
              {queue.map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary text-primary-foreground">#{a.queue_no ?? "—"}</Badge>
                    <div>
                      <p className="text-sm font-semibold">{a.patient?.first_name} {a.patient?.last_name}
                        {a.patient?.pmr_no && <span className="ml-2 text-xs text-muted-foreground">{a.patient.pmr_no}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.slot_start ? new Date(a.slot_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        {a.reason && ` · ${a.reason}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.payment_status === "paid" ? "default" : "secondary"} className="text-[10px]">{a.payment_status}</Badge>
                    <Select value={a.status} onValueChange={(s) => apptMut.mutate({ id: a.id, status: s as any })}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["scheduled","checked_in","in_progress","completed","cancelled","no_show"].map((s) => (
                          <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {a.payment_status !== "paid" && (
                      <Button size="sm" variant="outline"
                        onClick={() => payMut.mutate({
                          appointmentId: a.id,
                          amount: Number(a.consultation_fee || p?.consultation_fee || 0),
                          method: "cash",
                        })}
                      >Mark paid (cash)</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Leave manager */}
        <LeaveManager hospitalId={p?.hospital_id} />

        {/* Schedule editor */}
        <ScheduleEditor profile={p} onSave={(d) => updMut.mutate(d)} saving={updMut.isPending} />
      </main>
      </div>
      <DoctorAiAssistant />
    </div>
  );
}


function Stat({ icon: Icon, label, value }: any) {
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

function ScheduleEditor({ profile, onSave, saving }: { profile: any; onSave: (d: any) => void; saving: boolean }) {
  const [v, setV] = useState({
    specialization: profile?.specialization || "",
    department: profile?.department || "",
    bio: profile?.bio || "",
    consultation_fee: Number(profile?.consultation_fee || 0),
    experience_years: Number(profile?.experience_years || 0),
    working_days: (profile?.working_days as string[]) || ["mon","tue","wed","thu","fri"],
    working_hours: (profile?.working_hours as any) || { start: "09:00", end: "17:00" },
    slot_duration_min: Number(profile?.slot_duration_min || 15),
    max_patients_per_day: Number(profile?.max_patients_per_day || 50),
  });

  const toggleDay = (k: string) => {
    setV((s) => ({ ...s, working_days: s.working_days.includes(k) ? s.working_days.filter((d) => d !== k) : [...s.working_days, k] }));
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">My availability</h2>
      <p className="mt-1 text-xs text-muted-foreground">Patients see only the days, hours and slot length you set here.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><Label>Specialization</Label><Input value={v.specialization} onChange={(e) => setV({ ...v, specialization: e.target.value })} placeholder="Cardiology" /></div>
        <div><Label>Department</Label><Input value={v.department} onChange={(e) => setV({ ...v, department: e.target.value })} placeholder="OPD" /></div>
        <div><Label>Consultation fee (Rs)</Label><Input type="number" value={v.consultation_fee} onChange={(e) => setV({ ...v, consultation_fee: Number(e.target.value) })} /></div>
        <div><Label>Years of experience</Label><Input type="number" value={v.experience_years} onChange={(e) => setV({ ...v, experience_years: Number(e.target.value) })} /></div>
        <div className="md:col-span-2"><Label>Bio</Label><Textarea rows={2} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} /></div>
      </div>

      <div className="mt-6">
        <Label>Working days</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button key={d.k} type="button" onClick={() => toggleDay(d.k)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${v.working_days.includes(d.k) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-secondary"}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <div><Label>Start</Label><Input type="time" value={v.working_hours.start} onChange={(e) => setV({ ...v, working_hours: { ...v.working_hours, start: e.target.value } })} /></div>
        <div><Label>End</Label><Input type="time" value={v.working_hours.end} onChange={(e) => setV({ ...v, working_hours: { ...v.working_hours, end: e.target.value } })} /></div>
        <div><Label>Slot (min)</Label><Input type="number" min={5} max={120} value={v.slot_duration_min} onChange={(e) => setV({ ...v, slot_duration_min: Number(e.target.value) })} /></div>
        <div><Label>Max / day</Label><Input type="number" min={1} max={500} value={v.max_patients_per_day} onChange={(e) => setV({ ...v, max_patients_per_day: Number(e.target.value) })} /></div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => onSave(v)} disabled={saving} className="bg-gradient-brand text-primary-foreground">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save schedule
        </Button>
      </div>
    </Card>
  );
}

function LeaveManager({ hospitalId }: { hospitalId?: string | null }) {
  const fnList = useServerFn(listDoctorLeaves);
  const fnCreate = useServerFn(createDoctorLeave);
  const fnCancel = useServerFn(cancelDoctorLeave);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-leaves"], queryFn: () => fnList({ data: {} }) });
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");

  const createMut = useMutation({
    mutationFn: (d: any) => fnCreate({ data: d }),
    onSuccess: () => {
      toast.success("Leave added");
      setStartsOn(""); setEndsOn(""); setReason("");
      qc.invalidateQueries({ queryKey: ["my-leaves"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => fnCancel({ data: { id } }),
    onSuccess: () => { toast.success("Leave cancelled"); qc.invalidateQueries({ queryKey: ["my-leaves"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const today = new Date().toISOString().slice(0, 10);
  const leaves = (q.data?.leaves ?? []) as any[];
  const upcoming = leaves.filter((l) => l.status === "active" && l.ends_on >= today);
  const past = leaves.filter((l) => l.status !== "active" || l.ends_on < today);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Plane className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Leave / Time-off</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Mark days when you'll be unavailable. Patients won't be able to book on these dates, and receptionists will see your leave on the schedule.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div><Label>Start date</Label><Input type="date" min={today} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></div>
        <div><Label>End date</Label><Input type="date" min={startsOn || today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></div>
        <div className="md:col-span-2"><Label>Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conference, personal, etc." /></div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={!hospitalId || !startsOn || !endsOn || createMut.isPending}
          onClick={() => createMut.mutate({ hospitalId, startsOn, endsOn, reason: reason || undefined })}
          className="bg-gradient-brand text-primary-foreground"
        >
          {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plane className="mr-2 h-4 w-4" />}
          Add leave
        </Button>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Upcoming & active</p>
        {upcoming.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No upcoming leave.</p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-md border bg-secondary/30 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{l.starts_on}</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="font-medium">{l.ends_on}</span>
                  {l.reason && <span className="ml-2 text-xs text-muted-foreground">· {l.reason}</span>}
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => cancelMut.mutate(l.id)} disabled={cancelMut.isPending}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">History</p>
          <div className="space-y-1">
            {past.slice(0, 10).map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs text-muted-foreground">
                <span>{l.starts_on} → {l.ends_on}{l.reason ? ` · ${l.reason}` : ""}</span>
                <Badge variant="outline" className="text-[10px] capitalize">{l.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
