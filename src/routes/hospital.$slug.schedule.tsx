import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ModulePage } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, CalendarClock, DollarSign, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMySchedule, updateMySchedule, getMyTodayQueue, recordPayment } from "@/lib/schedule.functions";
import { updateAppointmentStatus } from "@/lib/appointments.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/hospital/$slug/schedule")({
  head: () => ({ meta: [{ title: "My schedule — MediFlow AI" }] }),
  component: SchedulePage,
});

const DAYS = [
  { k: "mon", label: "Mon" }, { k: "tue", label: "Tue" }, { k: "wed", label: "Wed" },
  { k: "thu", label: "Thu" }, { k: "fri", label: "Fri" }, { k: "sat", label: "Sat" }, { k: "sun", label: "Sun" },
];

function SchedulePage() {
  const { user } = useAuth();
  const fnGet = useServerFn(getMySchedule);
  const fnUpd = useServerFn(updateMySchedule);
  const fnQueue = useServerFn(getMyTodayQueue);
  const fnUpdAppt = useServerFn(updateAppointmentStatus);
  const fnPay = useServerFn(recordPayment);
  const qc = useQueryClient();

  const profileQ = useQuery({ queryKey: ["my-schedule"], queryFn: () => fnGet(), enabled: !!user });
  const queueQ = useQuery({ queryKey: ["my-queue"], queryFn: () => fnQueue(), enabled: !!user, refetchInterval: 15000 });

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("doc-sched-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-queue"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

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
  const [payFilter, setPayFilter] = useState<"all" | "paid" | "unpaid" | "cash" | "online">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "waiting" | "completed">("all");

  if (profileQ.isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const inQueue = queue.filter((q: any) => q.status === "scheduled" || q.status === "checked_in" || q.status === "in_progress").length;
  const paidCount = queue.filter((q: any) => q.payment_status === "paid").length;

  const filtered = (queue as any[]).filter((a) => {
    if (payFilter === "paid" && a.payment_status !== "paid") return false;
    if (payFilter === "unpaid" && a.payment_status === "paid") return false;
    if (payFilter === "cash" && a.payment_method !== "cash") return false;
    if (payFilter === "online" && a.payment_method === "cash") return false;
    if (statusFilter === "waiting" && !["scheduled","checked_in","in_progress"].includes(a.status)) return false;
    if (statusFilter === "completed" && a.status !== "completed") return false;
    return true;
  });

  return (
    <ModulePage title="My schedule & queue" subtitle="Set availability and run today's clinic in real time.">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Users} label="In queue now" value={String(inQueue)} />
        <Stat icon={CalendarClock} label="Total today" value={String(queue.length)} />
        <Stat icon={DollarSign} label="Paid" value={`${paidCount}/${queue.length}`} />
        <Stat icon={DollarSign} label="Fee" value={`Rs ${Number(p?.consultation_fee || 0).toLocaleString()}`} />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Today's queue</h2>
            <p className="text-xs text-muted-foreground">Live · auto-refreshes</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="waiting">Waiting / in consult</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={payFilter} onValueChange={(v) => setPayFilter(v as any)}>
              <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No appointments match the current filter.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((a: any) => {
              const isCompleted = a.status === "completed";
              const isActive = ["scheduled","checked_in","in_progress"].includes(a.status);
              return (
              <div key={a.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${isCompleted ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3">
                  <Badge className={isCompleted ? "bg-success/15 text-success border-success/30" : isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"} variant={isCompleted ? "outline" : "default"}>#{a.queue_no ?? "—"}</Badge>
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
                  <Badge variant={a.payment_status === "paid" ? "default" : "secondary"} className="text-[10px] capitalize">{a.payment_status}{a.payment_method ? ` · ${a.payment_method}` : ""}</Badge>
                  <Select value={a.status} onValueChange={(s) => apptMut.mutate({ id: a.id, status: s as any })}>
                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["scheduled","checked_in","in_progress","completed","cancelled","no_show"].map((s) => (
                        <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isCompleted && a.status !== "in_progress" && (
                    <Button size="sm" variant="outline" onClick={() => apptMut.mutate({ id: a.id, status: "in_progress" as any })}>Start consult</Button>
                  )}
                  {a.status === "in_progress" && (
                    <Button size="sm" onClick={() => apptMut.mutate({ id: a.id, status: "completed" as any })}>Complete</Button>
                  )}
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
            );})}
          </div>
        )}
      </Card>

      <ScheduleEditor profile={p} onSave={(d) => updMut.mutate(d)} saving={updMut.isPending} />
    </ModulePage>
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
