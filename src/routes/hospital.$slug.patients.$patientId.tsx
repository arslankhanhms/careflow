import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ModulePage } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPatientDetail } from "@/lib/patients.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Pill, FlaskConical, Activity, Receipt, Calendar, BedDouble, CalendarClock } from "lucide-react";

function computeAge(dob?: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export const Route = createFileRoute("/hospital/$slug/patients/$patientId")({
  head: () => ({ meta: [{ title: "Patient — MediFlow AI" }] }),
  component: PatientDetailPage,
});

type ViewMode = "all" | "opd" | "ipd" | "admission";

function PatientDetailPage() {
  const { slug, patientId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(getPatientDetail);
  const [view, setView] = useState<ViewMode>("all");
  const q = useQuery({
    queryKey: ["patient-detail", patientId],
    queryFn: () => fn({ data: { patientId } }),
    enabled: !!user,
  });

  // Realtime: when new labs/results/prescriptions/admissions arrive for this patient, refresh.
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`pt-detail-${patientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders", filter: `patient_id=eq.${patientId}` }, () => qc.invalidateQueries({ queryKey: ["patient-detail", patientId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_results" }, () => qc.invalidateQueries({ queryKey: ["patient-detail", patientId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions", filter: `patient_id=eq.${patientId}` }, () => qc.invalidateQueries({ queryKey: ["patient-detail", patientId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "admissions", filter: `patient_id=eq.${patientId}` }, () => qc.invalidateQueries({ queryKey: ["patient-detail", patientId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, patientId, qc]);

  if (q.isLoading) return <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading patient…</div>;
  if (q.error) return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;
  if (!q.data) return null;

  const { patient, appointments, prescriptions, labOrders, vitals, payments, admissions, followUps = [], visitCount = appointments?.length ?? 0 } = q.data as any;
  const age = computeAge(patient.dob);
  const today = new Date(); today.setHours(0,0,0,0);
  const missedFollowups = (followUps as any[]).filter((f) => new Date(f.due_date) < today);
  const upcomingFollowups = (followUps as any[]).filter((f) => new Date(f.due_date) >= today);

  // Filter appointments by selected view
  const visits = (appointments as any[]).filter((a) => {
    if (view === "all") return true;
    if (view === "admission") return false; // admissions shown separately
    if (view === "opd") return (a.type ?? "consultation") === "consultation" || a.type === "opd";
    if (view === "ipd") return a.type === "ipd" || a.type === "admission";
    return true;
  });
  const showAdmissions = view === "all" || view === "admission" || view === "ipd";
  return (
    <ModulePage
      title={`${patient.first_name} ${patient.last_name}`}
      subtitle={`MRN ${patient.mrn}${patient.cnic ? ` · CNIC ${patient.cnic}` : ""}${age != null ? ` · ${age}y` : ""}${patient.gender ? ` · ${patient.gender}` : ""}${patient.blood_group ? ` · ${patient.blood_group}` : ""} · ${visitCount} visit${visitCount === 1 ? "" : "s"}`}
      actions={<Button asChild variant="outline" size="sm"><Link to="/hospital/$slug/patients" params={{ slug }}><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to patients</Link></Button>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">View:</span>
        {(["all","opd","ipd","admission"] as ViewMode[]).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${view === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-secondary"}`}>
            {v === "all" ? "All" : v.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold">Profile</h3>
          <dl className="space-y-2 text-sm">
            <Row label="MRN" value={patient.mrn} />
            <Row label="CNIC" value={patient.cnic ?? "—"} />
            <Row label="Father name" value={patient.father_name ?? "—"} />
            <Row label="Age" value={age != null ? `${age} years` : "—"} />
            <Row label="DOB" value={patient.dob ?? "—"} />
            <Row label="Sex" value={patient.sex ?? patient.gender ?? "—"} />
            <Row label="Weight" value={patient.weight_kg ? `${patient.weight_kg} kg` : "—"} />
            <Row label="Phone" value={patient.phone ?? "—"} />
            <Row label="Email" value={patient.email ?? "—"} />
            <Row label="Address" value={patient.address ?? "—"} />
            <Row label="Visits" value={String(visitCount)} />
          </dl>
          {Array.isArray(patient.allergies) && patient.allergies.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-warning-foreground">Allergies</p>
              <div className="flex flex-wrap gap-1">
                {patient.allergies.map((a: string) => <Badge key={a} variant="outline" className="border-warning/40 bg-warning/10">{a}</Badge>)}
              </div>
            </div>
          )}
          {patient.notes && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{patient.notes}</p>
            </div>
          )}
          {Array.isArray(patient.chronic_conditions) && patient.chronic_conditions.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chronic conditions</p>
              <div className="flex flex-wrap gap-1">
                {patient.chronic_conditions.map((c: string) => <Badge key={c} variant="outline">{c}</Badge>)}
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Section icon={Pill} title={`Prescriptions (${prescriptions.length})`}>
            {prescriptions.length === 0 ? <Empty>No prescriptions yet.</Empty> : (
              <div className="space-y-3">
                {prescriptions.map((p: any) => (
                  <div key={p.id} className="rounded-md border p-3 text-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(p.issued_at).toLocaleString()}{p.doctor ? ` · Dr. ${p.doctor.display_name}` : ""}</span>
                      {p.diagnosis && <Badge variant="outline">{p.diagnosis}</Badge>}
                    </div>
                    <ul className="space-y-1">
                      {((p.medications as any[]) ?? []).map((m: any, i: number) => (
                        <li key={i}>
                          <p className="font-medium">{m.name}{m.dose ? ` · ${m.dose}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{[m.frequency, m.duration, m.instructions].filter(Boolean).join(" · ")}</p>
                        </li>
                      ))}
                    </ul>
                    {p.notes && <p className="mt-2 text-xs text-muted-foreground">Notes: {p.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section icon={Calendar} title={`Visits (${visits.length})`}>
            {visits.length === 0 ? <Empty>No visits recorded.</Empty> : (
              <ul className="divide-y text-sm">
                {visits.slice(0, 20).map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">{new Date(a.scheduled_at).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{a.doctor ? `Dr. ${a.doctor.display_name}` : "Unassigned"} · {a.reason ?? "—"} · {a.type ?? "consultation"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{a.payment_status ?? "unpaid"}</Badge>
                      <Badge variant="outline" className="capitalize">{a.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {showAdmissions && (
            <Section icon={BedDouble} title={`Admissions (${admissions.length})`}>
              {admissions.length === 0 ? <Empty>No admissions on record.</Empty> : (
                <ul className="divide-y text-sm">
                  {admissions.map((a: any) => (
                    <li key={a.id} className="py-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{new Date(a.admitted_at).toLocaleDateString()}{a.discharged_at ? ` → ${new Date(a.discharged_at).toLocaleDateString()}` : " · ongoing"}</p>
                        <Badge variant="outline" className={a.discharged_at ? "" : "border-success/30 bg-success/10 text-success"}>{a.discharged_at ? "Discharged" : "Active"}</Badge>
                      </div>
                      {a.diagnosis && <p className="text-xs text-muted-foreground">{a.diagnosis}</p>}
                      {a.discharge_summary && <p className="mt-1 text-xs text-muted-foreground">Summary: {a.discharge_summary}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          <Section icon={CalendarClock} title={`Follow-ups (${followUps.length})`}>
            {followUps.length === 0 ? <Empty>No follow-ups scheduled.</Empty> : (
              <div className="space-y-3">
                {upcomingFollowups.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</p>
                    <ul className="divide-y text-sm">
                      {upcomingFollowups.map((f: any) => (
                        <li key={f.id} className="flex items-center justify-between py-2">
                          <div>
                            <p className="font-medium">{new Date(f.due_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "2-digit", year: "numeric" })}</p>
                            <p className="text-xs text-muted-foreground">{f.doctor ? `Dr. ${f.doctor.display_name}` : "—"}{f.notes ? ` · ${f.notes}` : ""}</p>
                          </div>
                          <Badge variant="outline" className="border-success/30 bg-success/10">Scheduled</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {missedFollowups.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-destructive">Missed / Past</p>
                    <ul className="divide-y text-sm">
                      {missedFollowups.map((f: any) => (
                        <li key={f.id} className="flex items-center justify-between py-2">
                          <div>
                            <p className="font-medium">{new Date(f.due_date).toLocaleDateString()}</p>
                            <p className="text-xs text-muted-foreground">{f.doctor ? `Dr. ${f.doctor.display_name}` : "—"}{f.notes ? ` · ${f.notes}` : ""}</p>
                          </div>
                          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Missed</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section icon={FlaskConical} title={`Lab orders (${labOrders.length})`}>
            {labOrders.length === 0 ? <Empty>No lab orders.</Empty> : (
              <ul className="divide-y text-sm">
                {labOrders.map((l: any) => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">{(l.tests ?? []).join(", ")}</p>
                      <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()} · {l.priority}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{l.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={Activity} title={`Vitals (${vitals.length})`}>
            {vitals.length === 0 ? <Empty>No vitals recorded.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">BP</th><th className="py-2 pr-3">HR</th><th className="py-2 pr-3">Temp</th><th className="py-2 pr-3">SpO₂</th><th className="py-2 pr-3">Weight</th>
                  </tr></thead>
                  <tbody>
                    {vitals.map((v: any) => (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 text-xs">{new Date(v.recorded_at).toLocaleDateString()}</td>
                        <td className="py-2 pr-3">{v.bp_systolic ?? "—"}/{v.bp_diastolic ?? "—"}</td>
                        <td className="py-2 pr-3">{v.heart_rate ?? "—"}</td>
                        <td className="py-2 pr-3">{v.temperature ?? "—"}</td>
                        <td className="py-2 pr-3">{v.spo2 ?? "—"}</td>
                        <td className="py-2 pr-3">{v.weight_kg ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section icon={Receipt} title={`Payments (${payments.length})`}>
            {payments.length === 0 ? <Empty>No payments.</Empty> : (
              <ul className="divide-y text-sm">
                {payments.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">Rs {Number(p.amount).toLocaleString()} <span className="text-xs text-muted-foreground capitalize">· {p.method}</span></p>
                      <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()} · {p.receipt_no ?? "—"}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </ModulePage>
  );
}

function Section({ icon: Icon, title, children }: any) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</h3>
      {children}
    </Card>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-center text-sm text-muted-foreground">{children}</p>;
}
