import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ModulePage, StatCard } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Search, Stethoscope, Clock, CalendarCheck2, Plane } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getDoctorsScheduleOverview } from "@/lib/dashboard.functions";
import { listHospitalLeaves } from "@/lib/leaves.functions";

export const Route = createFileRoute("/hospital/$slug/doctor-schedules")({
  head: () => ({ meta: [{ title: "Doctor schedules — MediFlow AI" }] }),
  component: DoctorSchedulesPage,
});

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

function DoctorSchedulesPage() {
  const { user } = useAuth();
  const { slug } = Route.useParams();
  const fn = useServerFn(getDoctorsScheduleOverview);
  const fnLeaves = useServerFn(listHospitalLeaves);
  const q = useQuery({
    queryKey: ["doc-schedules"],
    queryFn: () => fn(),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const leavesQ = useQuery({
    queryKey: ["hospital-leaves", slug],
    queryFn: () => fnLeaves({ data: { hospitalSlug: slug } }),
    enabled: !!user && !!slug,
    refetchInterval: 60_000,
  });
  const [search, setSearch] = useState("");

  const docs = (q.data?.doctors ?? []) as any[];
  const filtered = search.trim()
    ? docs.filter((d) =>
        (d.name || "").toLowerCase().includes(search.trim().toLowerCase()) ||
        (d.specialization || "").toLowerCase().includes(search.trim().toLowerCase()))
    : docs;

  const activeToday = docs.filter((d) => d.is_working_today).length;
  const totalFree = docs.reduce((s, d) => s + (d.free_slots || 0), 0);
  const totalBooked = docs.reduce((s, d) => s + (d.booked_slots || 0), 0);

  return (
    <ModulePage title="Doctor schedules" subtitle="Live availability · today's slots · upcoming queue">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Doctors" value={String(docs.length)} />
        <StatCard label="On duty today" value={String(activeToday)} tone="success" />
        <StatCard label="Booked slots" value={String(totalBooked)} tone="info" />
        <StatCard label="Free slots" value={String(totalFree)} tone="warning" />
      </div>

      <div className="flex items-center justify-end">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search doctor…" className="h-8 w-64 pl-7 text-xs" />
        </div>
      </div>

      {(leavesQ.data?.leaves?.length ?? 0) > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plane className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Doctors on leave</h3>
            <Badge variant="outline" className="text-[10px]">{leavesQ.data!.leaves.length}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {leavesQ.data!.leaves.map((l: any) => (
              <div key={l.id} className="rounded-md border bg-amber-50/50 px-3 py-2 text-xs dark:bg-amber-950/20">
                <p className="font-semibold">Dr {l.doctor_name}</p>
                <p className="text-muted-foreground">{l.starts_on} → {l.ends_on}</p>
                {l.reason && <p className="mt-0.5 text-[11px] italic text-muted-foreground">{l.reason}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {q.isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No doctors found.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => (
            <Card key={d.doctor_id} className="overflow-hidden p-0">
              <div className="flex items-start gap-3 border-b p-4">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                  {d.photo_url ? (
                    <img src={d.photo_url} alt={d.name} className="h-10 w-10 rounded-full object-cover" />
                  ) : <Stethoscope className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Dr {d.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.specialization || "General"} · Fee Rs {d.consultation_fee.toLocaleString()}
                  </p>
                </div>
                <Badge variant={d.is_working_today ? "default" : "secondary"} className="text-[10px]">
                  {d.is_working_today ? "On duty" : "Off"}
                </Badge>
              </div>

              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{d.working_hours?.start || "—"} – {d.working_hours?.end || "—"}</span>
                  <span className="ml-auto">{d.slot_duration_min} min/slot</span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {["mon","tue","wed","thu","fri","sat","sun"].map((day) => (
                    <span key={day}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        (d.working_days ?? []).includes(day)
                          ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground line-through"
                      }`}>{DAY_LABELS[day]}</span>
                  ))}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Today utilisation</span>
                    <span className="font-mono">{d.booked_slots}/{d.total_slots} ({d.utilization}%)</span>
                  </div>
                  <Progress value={d.utilization} className="h-1.5" />
                  <p className="text-[11px] text-emerald-600">{d.free_slots} free slot{d.free_slots === 1 ? "" : "s"} remaining</p>
                </div>

                {d.upcoming.length > 0 && (
                  <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      <CalendarCheck2 className="h-3 w-3" /> Next appointments
                    </p>
                    {d.upcoming.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between text-[11px]">
                        <span className="font-mono">
                          {new Date(a.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="ml-2 flex-1 truncate">
                          {a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : "—"}
                        </span>
                        <Badge variant="outline" className="ml-1 text-[9px] capitalize">{a.status.replace("_"," ")}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </ModulePage>
  );
}
