import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Search, CalendarDays, FileText, Plus, Trash2, Save, LogOut, History, FlaskConical, CheckCircle2, Download, Printer, LayoutDashboard, TrendingUp as TrendingUpIcon, Stethoscope, Bell, MessageSquare, Settings, Sparkles, Play, Square, Eye, Activity, Scan, AlertTriangle, ClipboardList, CalendarClock } from "lucide-react";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { ConcessionRequestButton } from "@/components/concession-controls";
import { DoctorAiAssistant } from "@/components/doctor-ai-assistant";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getDoctorAppointmentsByDate,
  searchDoctorPatients,
  getPatientVisitHistory,
  saveDoctorPrescription,
  getPrescriptionContext,
  startConsultation,
  endConsultation,
} from "@/lib/schedule.functions";
import { listMyDoctorLabOrders } from "@/lib/lab.functions";
import { getMyDoctorEarnings } from "@/lib/dashboard.functions";
import { suggestDose, generatePrescription, askDoctorAssistant, suggestDiagnoses } from "@/lib/ai-assistants.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadPrescription, prescriptionDataURL, type PrescriptionData } from "@/lib/prescription-pdf";
import { TrendingUp } from "lucide-react";
import { FREQUENCY_OPTIONS, formatFrequency } from "@/lib/prescriptions";
import { searchMedicines, type MedicineEntry } from "@/lib/medicines";
import { searchMyPharmacyMedicines } from "@/lib/pharmacy.functions";

import { detectInteractions } from "@/lib/clinical/drug-interactions";
import { SYMPTOMS, searchSymptoms } from "@/lib/clinical/symptoms";
import { suggestDiagnosesFromSymptoms } from "@/lib/clinical/symptom-diagnosis-engine";
import { findDiagnosis } from "@/lib/clinical/diagnoses";
import { computeBMI } from "@/lib/clinical/bmi";
import { LabTestsAutocomplete } from "@/components/lab-tests-autocomplete";



export const Route = createFileRoute("/doctor/appointments")({
  head: () => ({ meta: [{ title: "Appointments & history — Doctor" }] }),
  component: DoctorAppointmentsPage,
});

function todayStr() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DoctorAppointmentsPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fnByDate = useServerFn(getDoctorAppointmentsByDate);
  const fnSearch = useServerFn(searchDoctorPatients);
  const fnHistory = useServerFn(getPatientVisitHistory);
  const fnSaveRx = useServerFn(saveDoctorPrescription);

  
  const fnMyLabs = useServerFn(listMyDoctorLabOrders);

  const [date, setDate] = useState(todayStr());
  const [q, setQ] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [openPatient, setOpenPatient] = useState<string | null>(null);
  const [viewPatient, setViewPatient] = useState<{ id: string; name?: string } | null>(null);
  const [rxAppt, setRxAppt] = useState<any | null>(null);
  const [openEarnings, setOpenEarnings] = useState(false);
  const fnEarnings = useServerFn(getMyDoctorEarnings);
  const earningsQ = useQuery({ queryKey: ["my-earnings"], queryFn: () => fnEarnings(), enabled: !!user, refetchInterval: 30_000 });

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [user, loading]);

  // Realtime: refresh today's appointments when payments or appointments change for this doctor
  useEffect(() => {
    if (!user) return;
    let ch: any;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      ch = supabase.channel(`doc-appts-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${user.id}` },
          () => { qc.invalidateQueries({ queryKey: ["doc-appts"] }); qc.invalidateQueries({ queryKey: ["my-earnings"] }); })
        .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
          () => { qc.invalidateQueries({ queryKey: ["doc-appts"] }); qc.invalidateQueries({ queryKey: ["my-earnings"] }); })
        .subscribe();
    });
    return () => { if (ch) import("@/integrations/supabase/client").then(({ supabase }) => supabase.removeChannel(ch)); };
  }, [user?.id, qc]);

  const dayQ = useQuery({
    queryKey: ["doc-appts", date],
    queryFn: () => fnByDate({ data: { date } }),
    enabled: !!user,
  });

  const searchQ = useQuery({
    queryKey: ["doc-search", searchTerm],
    queryFn: () => fnSearch({ data: { query: searchTerm } }),
    enabled: !!user && searchTerm.length >= 2,
  });

  const histQ = useQuery({
    queryKey: ["doc-hist", openPatient],
    queryFn: () => fnHistory({ data: { patientId: openPatient! } }),
    enabled: !!openPatient,
  });

  const rxMut = useMutation({
    mutationFn: (v: any) => fnSaveRx({ data: v }),
    onSuccess: (res: any) => {
      toast.success(res?.updated ? "Prescription updated — patient & pharmacy notified" : "Prescription saved");
      qc.invalidateQueries({ queryKey: ["doc-hist"] });
      qc.invalidateQueries({ queryKey: ["doc-appts"] });
      setRxAppt(null);
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const myLabsQ = useQuery({
    queryKey: ["doc-my-labs"],
    queryFn: () => fnMyLabs(),
    enabled: !!user,
  });


  const fnStart = useServerFn(startConsultation);
  const fnEnd = useServerFn(endConsultation);
  const startMut = useMutation({
    mutationFn: (id: string) => fnStart({ data: { appointment_id: id } }),
    onSuccess: () => { toast.success("Consultation started"); qc.invalidateQueries({ queryKey: ["doc-appts"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed to start"),
  });
  const endMut = useMutation({
    mutationFn: (id: string) => fnEnd({ data: { appointment_id: id } }),
    onSuccess: () => { toast.success("Consultation ended"); qc.invalidateQueries({ queryKey: ["doc-appts"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed to end"),
  });

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const doctorSidebar: SidebarSection[] = [{
    items: [
      { label: "Overview", to: "/doctor/overview", icon: LayoutDashboard },
      { label: "Today's Appointments", to: "/doctor/appointments", icon: CalendarDays },
      { label: "My Schedule", to: "/doctor/schedule", icon: LayoutDashboard },
      { label: "My Patients", to: "/doctor/patients", icon: Stethoscope },
      { label: "Patient Reports", to: "/doctor/reports", icon: FlaskConical },
      { label: "Closure Requests", to: "/doctor/closures", icon: ClipboardList },
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

  const todaysAppts = (dayQ.data ?? []) as any[];
  const paidCount = todaysAppts.filter((a) => a.payment_status === "paid").length;
  const todaysRevenue = todaysAppts
    .filter((a) => a.payment_status === "paid")
    .reduce((s, a) => s + Math.max(0, Number(a.consultation_fee || 0) - Number(a.concession_amount || 0)), 0);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar sections={doctorSidebar} footer={sidebarFooter} />
      <div className="flex flex-1 flex-col">
        <AppTopbar title="Appointments & history" subtitle={user?.email ?? undefined} right={topbarRight} />
        <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
          <div>
            <h1 className="text-2xl font-bold">Appointments & patient history</h1>
            <p className="text-sm text-muted-foreground">Browse a date or search a patient by MRN / CNIC / phone / name (last 3 months).</p>
          </div>


        {/* Today's revenue summary (paid consultations) */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4"><p className="text-xs text-muted-foreground">Appointments</p><p className="mt-1 text-2xl font-bold">{todaysAppts.length}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Paid today</p><p className="mt-1 text-2xl font-bold">{paidCount}</p></Card>
          <button type="button" onClick={() => setOpenEarnings(true)} className="text-left">
            <Card className="p-4 transition hover:border-primary hover:shadow-md cursor-pointer">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Today's earnings</p>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-1 text-2xl font-bold">Rs {todaysRevenue.toLocaleString()}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Click for 7-day breakdown</p>
            </Card>
          </button>
        </div>


        {/* Date picker */}
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="flex items-center gap-1"><CalendarDays className="h-4 w-4" /> Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setDate(todayStr())}>Today</Button>
          </div>

          <div className="mt-4">
            {dayQ.isLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (dayQ.data?.length ?? 0) === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No appointments on this date.</p>
            ) : (
              <>
                {(() => {
                  const list = dayQ.data ?? [];
                  const inProgress = list.find((x: any) => x.consultation_started_at && !x.consultation_ended_at);
                  const waiting = list.filter((x: any) => x.status !== "completed" && x.status !== "cancelled" && !x.consultation_started_at).length;
                  const completed = list.filter((x: any) => x.consultation_ended_at).length;
                  return (
                    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border bg-secondary/30 px-3 py-2 text-xs">
                      <span className="font-medium">
                        Now serving: {inProgress ? <Badge>#{inProgress.queue_no ?? "—"}</Badge> : <span className="text-muted-foreground">—</span>}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span><span className="font-semibold text-primary">{waiting}</span> waiting</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{completed} completed</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{list.length} total</span>
                    </div>
                  );
                })()}
              <div className="divide-y">
                {dayQ.data!.map((a: any) => {
                  const canPrescribe = !!a.consultation_ended_at;
                  return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <Badge>#{a.queue_no ?? "—"}</Badge>
                      <div>
                        <p className="text-sm font-semibold">{a.patient?.first_name} {a.patient?.last_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.patient?.mrn && `MRN: ${a.patient.mrn}`}
                          {a.patient?.cnic && ` · CNIC: ${a.patient.cnic}`}
                          {a.slot_start && ` · ${new Date(a.slot_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                          {a.reason && ` · ${a.reason}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                      {a.consultation_started_at && (
                        <span className="text-[10px] text-muted-foreground">
                          Started {new Date(a.consultation_started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {a.consultation_ended_at && ` · Ended ${new Date(a.consultation_ended_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                        </span>
                      )}
                      {a.status !== "completed" && a.status !== "cancelled" && (
                        !a.consultation_started_at ? (
                          <Button size="sm" variant="default" onClick={() => startMut.mutate(a.id)} disabled={startMut.isPending}>
                            <Play className="mr-1 h-3.5 w-3.5" /> Start
                          </Button>
                        ) : !a.consultation_ended_at ? (
                          <Button size="sm" variant="secondary" onClick={() => endMut.mutate(a.id)} disabled={endMut.isPending}>
                            <Square className="mr-1 h-3.5 w-3.5" /> End
                          </Button>
                        ) : null
                      )}
                      <Button size="sm" variant="outline" onClick={() => setViewPatient({ id: a.patient?.id, name: `${a.patient?.first_name ?? ""} ${a.patient?.last_name ?? ""}`.trim() })}><Eye className="mr-1 h-3.5 w-3.5" /> View</Button>
                      <Button size="sm" variant="outline" onClick={() => setOpenPatient(a.patient?.id)}><History className="mr-1 h-3.5 w-3.5" /> History</Button>
                      <ConcessionRequestButton
                        appointmentId={a.id}
                        patientName={`${a.patient?.first_name ?? ""} ${a.patient?.last_name ?? ""}`.trim()}
                        consultationFee={Number(a.consultation_fee || 0)}
                      />
                      <Button
                        size="sm"
                        onClick={() => canPrescribe ? setRxAppt(a) : toast.error("End the consultation first — prescribing is enabled after you click End.")}
                        disabled={!canPrescribe}
                        title={canPrescribe ? "" : "Available after you end the consultation"}
                      >
                        <FileText className="mr-1 h-3.5 w-3.5" /> Prescribe
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        </Card>

        {/* Patient search */}
        <Card className="p-4">
          <Label className="flex items-center gap-1"><Search className="h-4 w-4" /> Search patient (MRN, CNIC, phone, name)</Label>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setSearchTerm(q.trim()); }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. PMR-2026-001234 or 03001234567" />
            <Button type="submit"><Search className="mr-1 h-4 w-4" /> Search</Button>
          </form>

          {searchTerm.length >= 2 && (
            <div className="mt-4">
              {searchQ.isLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (searchQ.data?.length ?? 0) === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No matching patients in your last 3 months.</p>
              ) : (
                <div className="divide-y">
                  {searchQ.data!.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setOpenPatient(p.id)}
                      className="flex w-full items-center justify-between py-3 text-left hover:bg-secondary/50"
                    >
                      <div>
                        <p className="text-sm font-semibold">{p.first_name} {p.last_name}</p>
                        <p className="text-xs text-muted-foreground">{p.mrn} · {p.cnic ?? "—"} · {p.phone ?? "—"}</p>
                      </div>
                      <History className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* My lab orders */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1"><FlaskConical className="h-4 w-4" /> My lab orders</Label>
            <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["doc-my-labs"] })}>Refresh</Button>
          </div>
          <div className="mt-3">
            {myLabsQ.isLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (myLabsQ.data?.length ?? 0) === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">You haven't ordered any lab tests yet.</p>
            ) : (
              <div className="divide-y">
                {myLabsQ.data!.map((o: any) => (
                  <div key={o.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{o.patient?.first_name} {o.patient?.last_name} <span className="text-xs text-muted-foreground">· {o.patient?.mrn}</span></p>
                        <p className="text-xs text-muted-foreground">{(o.tests ?? []).join(", ")} · {o.priority} · {new Date(o.created_at).toLocaleString()}</p>
                      </div>
                      <Badge variant={o.status === "completed" ? "default" : "outline"} className="text-[10px]">
                        {o.status === "completed" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                        {o.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {o.results?.length > 0 && (
                      <div className="mt-2 rounded-md border bg-secondary/30 p-2 text-xs">
                        <p className="mb-1 font-semibold">Results:</p>
                        <table className="w-full">
                          <thead><tr className="text-left text-muted-foreground"><th>Test</th><th>Value</th><th>Unit</th><th>Range</th><th>Flag</th></tr></thead>
                          <tbody>
                            {o.results.map((r: any) => (
                              <tr key={r.id}><td>{r.test_name}</td><td>{r.value ?? "—"}</td><td>{r.unit ?? "—"}</td><td>{r.reference_range ?? "—"}</td><td>{r.flag ?? "—"}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </main>

      {/* Patient history dialog */}
      <Dialog open={!!openPatient} onOpenChange={(o) => !o && setOpenPatient(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Patient visit history (last 3 months)</DialogTitle></DialogHeader>
          {histQ.isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !histQ.data ? null : (
            <div className="space-y-4">
              <div className="rounded-md border bg-secondary/30 p-3 text-sm">
                <p className="font-semibold">{histQ.data.patient.first_name} {histQ.data.patient.last_name}</p>
                <p className="text-xs text-muted-foreground">
                  MRN {histQ.data.patient.mrn} · CNIC {histQ.data.patient.cnic ?? "—"} · {histQ.data.patient.gender ?? "—"} · DOB {histQ.data.patient.dob ?? "—"}
                </p>
                {(histQ.data.patient.allergies?.length || histQ.data.patient.chronic_conditions?.length) ? (
                  <p className="mt-1 text-xs">
                    {histQ.data.patient.allergies?.length ? <>Allergies: {histQ.data.patient.allergies.join(", ")} · </> : null}
                    {histQ.data.patient.chronic_conditions?.length ? <>Conditions: {histQ.data.patient.chronic_conditions.join(", ")}</> : null}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">Visits with you: <strong>{histQ.data.visits.length}</strong>{(histQ.data as any).diseases?.length ? <> · Disease history: {(histQ.data as any).diseases.join(", ")}</> : null}</p>
              </div>

              {(histQ.data as any).followUps?.length > 0 && (
                <Card className="p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Follow-up dates</p>
                  <ul className="space-y-1 text-xs">
                    {(histQ.data as any).followUps.map((f: any) => (
                      <li key={f.id}>• {new Date(f.due_date).toLocaleDateString()}{f.notes ? ` — ${f.notes}` : ""}</li>
                    ))}
                  </ul>
                </Card>
              )}

              {(histQ.data as any).labs?.length > 0 && (
                <Card className="p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Lab reports</p>
                  <div className="space-y-2">
                    {(histQ.data as any).labs.map((l: any) => (
                      <div key={l.id} className="rounded-md border bg-secondary/30 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{(l.tests ?? []).join(", ")}</p>
                          <Badge variant="outline" className="text-[10px]">{l.status.replace("_"," ")}</Badge>
                        </div>
                        <p className="text-muted-foreground">{new Date(l.created_at).toLocaleString()} · {l.priority}</p>
                        {l.results?.length > 0 && (
                          <ul className="mt-1 ml-4 list-disc">
                            {l.results.map((r: any) => (
                              <li key={r.id}>{r.test_name}: {r.value ?? "—"} {r.unit ?? ""} {r.flag ? `(${r.flag})` : ""}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}


              {histQ.data.visits.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No visits in the last 3 months.</p>
              ) : histQ.data.visits.map((v: any) => (
                <Card key={v.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{new Date(v.scheduled_at).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.reason || "—"} · <Badge variant="outline" className="text-[10px]">{v.status}</Badge></p>
                    </div>
                  </div>
                  {v.prescriptions?.length ? v.prescriptions.map((rx: any) => (
                    <div key={rx.id} className="mt-2 rounded-md border bg-background p-2 text-xs">
                      {rx.diagnosis && <p><strong>Diagnosis:</strong> {rx.diagnosis}</p>}
                      {Array.isArray(rx.medications) && rx.medications.length > 0 && (
                        <ul className="ml-4 list-disc">
                          {rx.medications.map((m: any, i: number) => (
                            <li key={i}><strong>{m.name}</strong>{m.dose ? ` ${m.dose}` : ""}{m.frequency ? ` · ${m.frequency}` : ""}{m.duration ? ` · ${m.duration}` : ""}{m.instructions ? ` — ${m.instructions}` : ""}</li>
                          ))}
                        </ul>
                      )}
                      {rx.notes && <p className="mt-1 text-muted-foreground">{rx.notes}</p>}
                    </div>
                  )) : <p className="mt-2 text-xs text-muted-foreground">No prescription recorded.</p>}
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Comprehensive patient View dialog (7 tabs) */}
      {viewPatient && (
        <PatientViewDialog
          patientId={viewPatient.id}
          headerName={viewPatient.name}
          onClose={() => setViewPatient(null)}
          fnHistory={fnHistory}
          onEditRx={(rx, visit, patient) => {
            setViewPatient(null);
            setRxAppt({
              id: visit.id,
              patient: patient ?? { id: viewPatient.id, first_name: viewPatient.name?.split(" ")[0], last_name: viewPatient.name?.split(" ").slice(1).join(" ") },
              existingRx: rx,
            });
          }}
        />
      )}

      {/* Prescription editor */}
      {rxAppt && (
        <PrescriptionDialog
          appt={rxAppt}
          onClose={() => setRxAppt(null)}
          onSave={(v) => rxMut.mutate({ appointmentId: rxAppt.id, prescriptionId: rxAppt.existingRx?.id, ...v })}
          saving={rxMut.isPending}
        />
      )}


      {/* Earnings detail dialog: today's paid list + 7-day breakdown */}
      <Dialog open={openEarnings} onOpenChange={setOpenEarnings}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>My earnings — today & last 7 days</DialogTitle></DialogHeader>
          {(() => {
            const todays = (dayQ.data ?? []) as any[];
            const paidToday = todays.filter((a) => a.payment_status === "paid");
            const todayRevenue = paidToday.reduce((s, a) => s + Number(a.consultation_fee || 0), 0);
            const d: any = earningsQ.data ?? { days: [], series: [], totals: {}, counts: {} };
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Card className="p-3"><p className="text-[10px] text-muted-foreground">Today</p><p className="text-lg font-bold">Rs {todayRevenue.toLocaleString()}</p></Card>
                  <Card className="p-3"><p className="text-[10px] text-muted-foreground">7 days</p><p className="text-lg font-bold">Rs {(d.totals.week || 0).toLocaleString()}</p></Card>
                  <Card className="p-3"><p className="text-[10px] text-muted-foreground">Cash</p><p className="text-lg font-bold">Rs {(d.totals.cash || 0).toLocaleString()}</p></Card>
                  <Card className="p-3"><p className="text-[10px] text-muted-foreground">Online</p><p className="text-lg font-bold">Rs {(d.totals.online || 0).toLocaleString()}</p></Card>
                </div>

                <Card className="p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Today's paid consultations ({paidToday.length})</p>
                  {paidToday.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">No paid consultations yet today.</p>
                  ) : (
                    <div className="divide-y text-sm">
                      {paidToday.map((a) => (
                        <div key={a.id} className="flex items-center justify-between py-2">
                          <div>
                            <p className="text-sm font-medium">{a.patient?.first_name} {a.patient?.last_name}</p>
                            <p className="text-[10px] text-muted-foreground">{a.patient?.mrn} · {a.slot_start ? new Date(a.slot_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</p>
                          </div>
                          <p className="text-sm font-semibold">Rs {Number(a.consultation_fee || 0).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Last 7 days breakdown</p>
                  {(d.days?.length ?? 0) === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">No earnings yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {d.days.map((day: string, i: number) => {
                        const val = d.series[i] || 0;
                        const max = Math.max(1, ...d.series);
                        const pct = (val / max) * 100;
                        return (
                          <div key={day} className="flex items-center gap-2 text-xs">
                            <span className="w-20 text-muted-foreground">{new Date(day).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
                            <div className="flex-1 h-2 rounded-full bg-secondary">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-24 text-right font-semibold">Rs {val.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                <div className="flex justify-end">
                  <Link to="/doctor/earnings"><Button variant="outline" size="sm">Open full earnings page</Button></Link>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      </div>
      <DoctorAiAssistant />
    </div>

  );
}


function PrescriptionDialog({ appt, onClose, onSave, saving }: { appt: any; onClose: () => void; onSave: (v: any) => void; saving: boolean }) {
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [vitals, setVitals] = useState<any>({ bp: "", pulse: "", temperature: "", sugar: "", spo2: "", respiratory_rate: "", weight: "", height: "" });
  const [meds, setMeds] = useState<any[]>([{ name: "", dose: "", frequency: "", duration: "", instructions: "" }]);
  const [nextCheckup, setNextCheckup] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // New clinical fields
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomQuery, setSymptomQuery] = useState("");
  const [examination, setExamination] = useState("");
  const [allergiesDrug, setAllergiesDrug] = useState<string[]>([]);
  const [allergiesFood, setAllergiesFood] = useState<string[]>([]);
  const [chronicConditions, setChronicConditions] = useState<string[]>([]);
  const [labTests, setLabTests] = useState<string[]>([]);
  const [labPriority, setLabPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [labNotes, setLabNotes] = useState("");
  const [labDlgOpen, setLabDlgOpen] = useState(false);
  const [suggestedTreatment, setSuggestedTreatment] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [aiDxLoading, setAiDxLoading] = useState(false);
  const [aiDxResult, setAiDxResult] = useState<any[] | null>(null);

  const fnCtx = useServerFn(getPrescriptionContext);
  const fnAiDx = useServerFn(suggestDiagnoses);
  const ctxQ = useQuery({
    queryKey: ["rx-ctx", appt.id],
    queryFn: () => fnCtx({ data: { appointmentId: appt.id } }),
    enabled: !!appt?.id,
  });

  // Pre-fill from existing prescription when editing from Rx History
  useEffect(() => {
    const rx = appt?.existingRx;
    if (!rx) return;
    if (rx.diagnosis) setDiagnosis(rx.diagnosis);
    if (rx.notes) setNotes(rx.notes);
    if (rx.vitals && typeof rx.vitals === "object") setVitals((prev: any) => ({ ...prev, ...rx.vitals }));
    if (Array.isArray(rx.medications) && rx.medications.length) {
      setMeds(rx.medications.map((m: any) => ({
        name: m.name ?? "", dose: m.dose ?? "", frequency: m.frequency ?? "", duration: m.duration ?? "", instructions: m.instructions ?? "",
      })));
    }
    if (Array.isArray(rx.symptoms)) setSymptoms(rx.symptoms);
    if (rx.examination) setExamination(rx.examination);
    if (Array.isArray(rx.allergies_drug)) setAllergiesDrug(rx.allergies_drug);
    if (Array.isArray(rx.allergies_food)) setAllergiesFood(rx.allergies_food);
    if (Array.isArray(rx.chronic_conditions)) setChronicConditions(rx.chronic_conditions);
    if (Array.isArray(rx.lab_tests)) setLabTests(rx.lab_tests);
    if (rx.suggested_treatment) setSuggestedTreatment(rx.suggested_treatment);
    if (rx.follow_up_notes) setFollowUpNotes(rx.follow_up_notes);
    if (rx.follow_up_date) setNextCheckup(String(rx.follow_up_date).slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.existingRx?.id]);

  // Pre-fill allergies/conditions from patient profile when context loads (only for NEW rx)
  useEffect(() => {
    if (appt?.existingRx) return;
    const p = ctxQ.data?.patient;
    if (!p) return;
    if (allergiesDrug.length === 0 && Array.isArray(p.allergies) && p.allergies.length) setAllergiesDrug(p.allergies);
    if (chronicConditions.length === 0 && Array.isArray(p.chronic_conditions) && p.chronic_conditions.length) setChronicConditions(p.chronic_conditions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxQ.data?.patient?.id]);

  const addMed = () => setMeds((m) => [...m, { name: "", dose: "", frequency: "", duration: "", instructions: "" }]);
  const rm = (i: number) => setMeds((m) => m.filter((_, idx) => idx !== i));
  const updV = (k: string, v: string) => setVitals((p: any) => ({ ...p, [k]: v }));

  // Auto BMI
  const bmi = computeBMI(vitals.weight, vitals.height);

  // Live drug interactions
  const interactions = detectInteractions(meds.map((m) => m.name).filter(Boolean));

  // Local symptom→diagnosis suggestions
  const localDxSugg = symptoms.length ? suggestDiagnosesFromSymptoms(symptoms.map((s) => s.toLowerCase()), 4) : [];

  const applyDiagnosis = (name: string) => {
    setDiagnosis(name);
    const entry = findDiagnosis(name);
    if (entry) {
      if (!nextCheckup) {
        const dt = new Date(); dt.setDate(dt.getDate() + entry.followUpDays);
        setNextCheckup(dt.toISOString().slice(0, 10));
      }
      if (entry.suggestedMeds?.length) {
        const filled = meds.filter((x) => x.name.trim());
        const additions = entry.suggestedMeds.map((m) => ({
          name: m.name, dose: m.dose || "", frequency: m.frequency ? formatFrequency(m.frequency) : "",
          duration: m.duration || "", instructions: "",
        }));
        setMeds([...filled, ...additions, { name: "", dose: "", frequency: "", duration: "", instructions: "" }]);
      }
    }
  };

  const runAiDx = async () => {
    if (!symptoms.length) { toast.error("Add symptoms first"); return; }
    setAiDxLoading(true); setAiDxResult(null);
    try {
      const p = ctxQ.data?.patient;
      const age = p?.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (365.25 * 24 * 3600 * 1000)) : undefined;
      const r: any = await fnAiDx({ data: {
        symptoms, patientAge: age, patientSex: p?.gender || undefined,
        chronicConditions: chronicConditions.length ? chronicConditions : undefined,
      }});
      if (r?.ok) setAiDxResult(r.result?.suggestions ?? []);
      else toast.error(r?.error || "AI failed");
    } finally { setAiDxLoading(false); }
  };

  const buildData = (): PrescriptionData => ({
    hospital: ctxQ.data?.hospital ?? null,
    doctor: ctxQ.data?.doctor ?? null,
    patient: ctxQ.data?.patient ?? appt.patient,
    appointment: ctxQ.data?.appointment ?? null,
    diagnosis,
    notes,
    vitals,
    medications: meds.filter((m) => m.name.trim()),
    symptoms,
    examination,
    allergiesDrug,
    allergiesFood,
    chronicConditions,
    labTests,
    suggestedTreatment,
    followUpDate: nextCheckup || null,
    followUpNotes,
    issuedAt: new Date(),
  });

  const refreshPreview = () => setPreviewUrl(prescriptionDataURL(buildData()));
  const handleDownload = () => downloadPrescription(buildData());

  // Auto-render preview whenever ctx loads or inputs change
  useEffect(() => {
    if (!ctxQ.data) return;
    const t = setTimeout(() => {
      try { setPreviewUrl(prescriptionDataURL(buildData())); } catch {}
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxQ.data, diagnosis, notes, JSON.stringify(vitals), JSON.stringify(meds), JSON.stringify(symptoms), examination, JSON.stringify(allergiesDrug), JSON.stringify(allergiesFood), JSON.stringify(chronicConditions), JSON.stringify(labTests), suggestedTreatment, nextCheckup, followUpNotes]);

  const symptomSuggestions = symptomQuery.trim().length >= 1
    ? searchSymptoms(symptomQuery, 8).filter((s) => !symptoms.includes(s))
    : [];

  const addSymptom = (s: string) => {
    const v = s.trim(); if (!v) return;
    if (symptoms.includes(v)) return;
    setSymptoms((arr) => [...arr, v]);
    setSymptomQuery("");
  };

  const ChipList = ({ values, onRemove, color = "secondary" }: { values: string[]; onRemove: (v: string) => void; color?: string }) =>
    values.length ? (
      <div className="mt-1 flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge key={v} variant={color as any} className="cursor-pointer text-[10px]" onClick={() => onRemove(v)}>
            {v} ✕
          </Badge>
        ))}
      </div>
    ) : null;

  const CsvField = ({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) => {
    const [q, setQ] = useState("");
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <div className="flex gap-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                const v = q.trim().replace(/,$/, "");
                if (v && !values.includes(v)) onChange([...values, v]);
                setQ("");
              }
            }} />
          <Button type="button" size="sm" variant="outline" onClick={() => {
            const v = q.trim(); if (v && !values.includes(v)) onChange([...values, v]); setQ("");
          }}>Add</Button>
        </div>
        <ChipList values={values} onRemove={(v) => onChange(values.filter((x) => x !== v))} />
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{appt?.existingRx ? "Edit prescription" : "Prescription"} · {appt.patient?.first_name} {appt.patient?.last_name}</DialogTitle></DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Form */}
          <div className="space-y-3">
            {/* Symptoms */}
            <div className="rounded-md border bg-secondary/30 p-3">
              <Label className="text-xs font-semibold uppercase">Symptoms</Label>
              <div className="relative mt-1">
                <Input value={symptomQuery} onChange={(e) => setSymptomQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSymptom(symptomQuery.replace(/,$/, "")); } }}
                  placeholder="Type a symptom (e.g. fever) and press Enter" />
                {symptomSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg">
                    {symptomSuggestions.map((s) => (
                      <button key={s} type="button" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-secondary"
                        onMouseDown={(e) => { e.preventDefault(); addSymptom(s); }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <ChipList values={symptoms} onRemove={(v) => setSymptoms((arr) => arr.filter((x) => x !== v))} />
              {localDxSugg.length > 0 && (
                <div className="mt-2 rounded-md border border-dashed bg-background p-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">Likely diagnoses (local engine):</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {localDxSugg.map((s) => (
                      <Button key={s.diagnosis.name} type="button" size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => applyDiagnosis(s.diagnosis.name)}>
                        {s.diagnosis.name} <span className="ml-1 opacity-60">{Math.round(s.score * 100)}%</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2 flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={runAiDx} disabled={aiDxLoading || !symptoms.length}>
                  {aiDxLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />} AI diagnose
                </Button>
              </div>
              {aiDxResult && aiDxResult.length > 0 && (
                <div className="mt-2 space-y-1">
                  {aiDxResult.map((s, i) => (
                    <div key={i} className="rounded-md border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{s.diagnosis}</p>
                        <div className="flex items-center gap-1">
                          <Badge variant={s.likelihood === "high" ? "destructive" : "secondary"} className="text-[10px]">{s.likelihood}</Badge>
                          <Button type="button" size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => applyDiagnosis(s.diagnosis)}>Use</Button>
                        </div>
                      </div>
                      {s.rationale && <p className="mt-1 text-[10px] text-muted-foreground">{s.rationale}</p>}
                      {s.references?.length > 0 && <p className="mt-1 text-[10px] italic text-muted-foreground">Refs: {s.references.join("; ")}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Diagnosis</Label>
              <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Acute pharyngitis" />
            </div>

            <div className="rounded-md border bg-secondary/30 p-3">
              <Label className="text-xs font-semibold uppercase">Vitals</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input value={vitals.bp} onChange={(e) => updV("bp", e.target.value)} placeholder="B.P. (e.g. 120/80)" />
                <Input value={vitals.pulse} onChange={(e) => updV("pulse", e.target.value)} placeholder="Pulse (bpm)" />
                <Input value={vitals.temperature} onChange={(e) => updV("temperature", e.target.value)} placeholder="Temp (°F)" />
                <Input value={vitals.sugar} onChange={(e) => updV("sugar", e.target.value)} placeholder="Sugar (mg/dl)" />
                <Input value={vitals.spo2} onChange={(e) => updV("spo2", e.target.value)} placeholder="SpO₂ (%)" />
                <Input value={vitals.respiratory_rate} onChange={(e) => updV("respiratory_rate", e.target.value)} placeholder="Resp. rate" />
                <Input value={vitals.weight} onChange={(e) => updV("weight", e.target.value)} placeholder="Weight (kg)" />
                <Input value={vitals.height} onChange={(e) => updV("height", e.target.value)} placeholder="Height (cm)" />
              </div>
              {bmi && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">BMI:</span>
                  <Badge variant={bmi.tone === "green" ? "default" : "secondary"}>{bmi.bmi} · {bmi.category}</Badge>
                </div>
              )}
            </div>

            <div>
              <Label>Examination</Label>
              <Textarea rows={2} value={examination} onChange={(e) => setExamination(e.target.value)}
                placeholder="O/E findings: throat congested, chest clear, abdomen soft…" />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <CsvField label="Drug allergies" values={allergiesDrug} onChange={setAllergiesDrug} placeholder="e.g. Penicillin" />
              <CsvField label="Food allergies" values={allergiesFood} onChange={setAllergiesFood} placeholder="e.g. Peanuts" />
            </div>
            <CsvField label="Existing / chronic conditions" values={chronicConditions} onChange={setChronicConditions} placeholder="e.g. Diabetes, HTN" />

            <div>
              <div className="flex items-center justify-between"><Label>℞ Medications</Label><Button type="button" size="sm" variant="outline" onClick={addMed}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button></div>
              <div className="mt-2 space-y-2">
                {meds.map((m, i) => (
                  <MedRow
                    key={i}
                    row={m}
                    onChange={(patch) => setMeds((arr) => arr.map((x, idx) => idx === i ? { ...x, ...patch } : x))}
                    onRemove={meds.length > 1 ? () => rm(i) : undefined}
                    patient={ctxQ.data?.patient ?? appt.patient}
                    diagnosis={diagnosis}
                  />
                ))}
              </div>
              {interactions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {interactions.map((it, i) => (
                    <div key={i} className={`flex items-start gap-2 rounded-md border p-2 text-xs ${it.severity === "high" ? "border-destructive bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold uppercase">{it.severity === "high" ? "RED ALERT — Dangerous interaction" : "Caution — Interaction"}</p>
                        <p>{it.drugA} + {it.drugB}: {it.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lab test order — red button replacing the autocomplete */}
            <div className="rounded-md border bg-secondary/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase">
                  <FlaskConical className="h-3.5 w-3.5" /> Lab tests
                </Label>
                <Button type="button" size="sm" onClick={() => setLabDlgOpen(true)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  <FlaskConical className="mr-1 h-3.5 w-3.5" /> Lab test order
                </Button>
              </div>
              {labTests.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {labTests.map((t, i) => (
                    <Badge key={`${t}-${i}`} variant="secondary" className="gap-1 pr-1 text-xs">
                      {t}
                      <button type="button" onClick={() => setLabTests((a) => a.filter((_, idx) => idx !== i))}
                        className="rounded hover:bg-destructive/20">×</button>
                    </Badge>
                  ))}
                  <span className="ml-1 text-[10px] text-muted-foreground self-center">· {labPriority.toUpperCase()}</span>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  No lab tests advised. Tests sent here go to the receptionist for fee collection first, then to the lab.
                </p>
              )}
            </div>

            <Dialog open={labDlgOpen} onOpenChange={setLabDlgOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Order lab tests · {appt.patient?.first_name} {appt.patient?.last_name}</DialogTitle></DialogHeader>
                <LabTestsOrderForm
                  initialTests={labTests}
                  initialPriority={labPriority}
                  initialNotes={labNotes}
                  onSave={(v) => { setLabTests(v.tests); setLabPriority(v.priority); setLabNotes(v.notes); setLabDlgOpen(false); }}
                  onCancel={() => setLabDlgOpen(false)}
                />
              </DialogContent>
            </Dialog>

            <div>
              <Label>Suggested treatment (non-pharmacological)</Label>
              <Textarea rows={2} value={suggestedTreatment} onChange={(e) => setSuggestedTreatment(e.target.value)}
                placeholder="Lifestyle, diet, physiotherapy, referrals…" />
            </div>

            <div><Label>Notes / Advice</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Follow-up advice, dietary instructions..." /></div>


            {/* Next checkup */}
            <div className="rounded-md border bg-secondary/30 p-3">
              <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase">
                <CalendarClock className="h-3.5 w-3.5" /> Next Checkup
              </Label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={nextCheckup}
                  min={todayStr()}
                  onChange={(e) => setNextCheckup(e.target.value)}
                  className="w-48"
                />
                {nextCheckup && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setNextCheckup("")}>Clear</Button>
                )}
                {!nextCheckup && (
                  <div className="flex gap-1">
                    {[3, 7, 14, 30].map((d) => (
                      <Button key={d} type="button" size="sm" variant="outline" className="h-7 text-[10px]"
                        onClick={() => {
                          const dt = new Date(); dt.setDate(dt.getDate() + d);
                          setNextCheckup(dt.toISOString().slice(0, 10));
                        }}>+{d}d</Button>
                    ))}
                  </div>
                )}
              </div>
              {ctxQ.data?.nextFollowUp?.due_date && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Patient already has a scheduled checkup on{" "}
                  <span className="font-semibold">{new Date(ctxQ.data.nextFollowUp.due_date).toLocaleDateString()}</span>.
                </p>
              )}
              <Textarea rows={2} className="mt-2" value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="Follow-up instructions (e.g. repeat CBC, review wound)…" />
            </div>

          </div>

          {/* Right column: AI Assistant + Live preview tabs */}
          <div className="space-y-2">
            <Tabs defaultValue="ai" className="w-full">
              <div className="flex items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="ai"><Sparkles className="mr-1 h-3.5 w-3.5" /> AI Assistant</TabsTrigger>
                  <TabsTrigger value="preview"><FileText className="mr-1 h-3.5 w-3.5" /> Live preview</TabsTrigger>
                </TabsList>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={refreshPreview} disabled={ctxQ.isLoading}>
                    <FileText className="mr-1 h-3.5 w-3.5" /> Refresh
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleDownload} disabled={ctxQ.isLoading}>
                    <Download className="mr-1 h-3.5 w-3.5" /> Download
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={ctxQ.isLoading}
                    onClick={() => {
                      try {
                        const url = prescriptionDataURL(buildData());
                        const w = window.open(url, "_blank");
                        if (w) setTimeout(() => { try { w.print(); } catch {} }, 500);
                      } catch {}
                    }}>
                    <Printer className="mr-1 h-3.5 w-3.5" /> Print
                  </Button>
                </div>
              </div>

              <TabsContent value="ai" className="mt-2">
                <PrescriptionAiPanel
                  diagnosis={diagnosis}
                  patient={ctxQ.data?.patient ?? appt.patient}
                  currentMeds={meds}
                  onAddMedication={(m) => setMeds((arr) => {
                    const empties = arr.filter((x) => !x.name.trim());
                    const filled = arr.filter((x) => x.name.trim());
                    return [...filled, { name: m.name, dose: m.dose, frequency: m.frequency, duration: m.duration, instructions: m.instructions }, ...empties.slice(0, 1)];
                  })}
                />
              </TabsContent>

              <TabsContent value="preview" className="mt-2">
                <div className="h-[520px] overflow-hidden rounded-md border bg-white">
                  {previewUrl ? (
                    <iframe title="Prescription preview" src={previewUrl} className="h-full w-full" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {ctxQ.isLoading ? "Loading hospital & patient data…" : "Click Refresh to render the live preview."}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !meds.some((m) => m.name.trim())} onClick={() => {
            onSave({
              diagnosis, notes, vitals,
              medications: meds.filter((m) => m.name.trim()),
              next_checkup_date: nextCheckup || null,
              symptoms, examination,
              allergies_drug: allergiesDrug, allergies_food: allergiesFood,
              chronic_conditions: chronicConditions,
              lab_tests: labTests,
              lab_priority: labPriority,
              lab_notes: labNotes,
              suggested_treatment: suggestedTreatment,
              follow_up_notes: followUpNotes,
            });
          }}>

            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {appt?.existingRx ? "Update Prescription" : "Send Prescription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============= Lab tests order form (inside Prescription dialog) ============= */
function LabTestsOrderForm({
  initialTests, initialPriority, initialNotes, onSave, onCancel,
}: {
  initialTests: string[];
  initialPriority: "routine" | "urgent" | "stat";
  initialNotes: string;
  onSave: (v: { tests: string[]; priority: "routine" | "urgent" | "stat"; notes: string }) => void;
  onCancel: () => void;
}) {
  const [tests, setTests] = useState<string[]>(initialTests);
  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">(initialPriority);
  const [notes, setNotes] = useState(initialNotes);
  return (
    <div className="space-y-3">
      <LabTestsAutocomplete
        values={tests}
        onChange={setTests}
        label="Tests"
        placeholder="Type to search (e.g. CBC, LFT, X-Ray)…"
      />
      <div>
        <Label>Priority</Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="routine">Routine</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="stat">STAT</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Notes for lab</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical context, fasting, etc." />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={tests.length === 0}
          onClick={() => onSave({ tests, priority, notes })}>
          <FlaskConical className="mr-2 h-4 w-4" /> Send to lab
        </Button>
      </DialogFooter>
    </div>
  );
}


/* ============= Medication row with autocomplete + frequency + AI dose ============= */
type MedRowProps = {
  row: { name: string; dose: string; frequency: string; duration: string; instructions: string };
  onChange: (patch: Partial<MedRowProps["row"]>) => void;
  onRemove?: () => void;
  patient: any;
  diagnosis: string;
};

/** Remembers medicine entry the user picked, so dose strengths drop-down can be rendered. */
const MEDICINE_FORM_CACHE: Map<string, MedicineEntry> = new Map();

function MedRow({ row, onChange, onRemove, patient, diagnosis }: MedRowProps) {
  const [showSug, setShowSug] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const fnDose = useServerFn(suggestDose);
  const fnSearchPharm = useServerFn(searchMyPharmacyMedicines);

  // Pharmacy search (triggers after 2 chars)
  const [pharmRows, setPharmRows] = useState<any[]>([]);
  const [pharmLoading, setPharmLoading] = useState(false);
  const [pharmSearched, setPharmSearched] = useState(false);
  useEffect(() => {
    const q = row.name.trim();
    if (q.length < 2) { setPharmRows([]); setPharmSearched(false); return; }
    let cancel = false;
    setPharmLoading(true);
    const t = setTimeout(() => {
      fnSearchPharm({ data: { q } })
        .then((r: any) => { if (!cancel) { setPharmRows(r?.medicines ?? []); setPharmSearched(true); } })
        .catch(() => { if (!cancel) { setPharmRows([]); setPharmSearched(true); } })
        .finally(() => { if (!cancel) setPharmLoading(false); });
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [row.name]);

  // Fallback to seed catalog only as a secondary hint
  const catalogSuggestions: MedicineEntry[] = row.name.trim().length >= 2 ? searchMedicines(row.name, 4) : [];
  const picked = MEDICINE_FORM_CACHE.get(row.name) || null;

  // Show "not available" warning when user typed enough but pharmacy returned 0
  const notInPharmacy =
    row.name.trim().length >= 2 && pharmSearched && !pharmLoading && pharmRows.length === 0;

  const computeAge = (): number | undefined => {
    const dob = patient?.date_of_birth || patient?.dob;
    if (!dob) return undefined;
    const ms = Date.now() - new Date(dob).getTime();
    if (Number.isNaN(ms)) return undefined;
    return Math.max(0, Math.floor(ms / (365.25 * 24 * 3600 * 1000)));
  };

  const runAi = async () => {
    if (!row.name.trim()) { toast.error("Enter medicine name first"); return; }
    setAiOpen(true); setAiLoading(true); setAiResult(null);
    try {
      const r: any = await fnDose({ data: {
        medicineName: row.name,
        medicineForm: picked?.form,
        patientAge: computeAge(),
        patientSex: patient?.gender || patient?.sex,
        diagnosis: diagnosis || undefined,
      }});
      if (r?.ok) setAiResult(r.result); else toast.error(r?.error || "AI failed");
    } finally { setAiLoading(false); }
  };

  const applyAi = () => {
    if (!aiResult) return;
    onChange({
      dose: aiResult.recommendedDose || row.dose,
      frequency: aiResult.recommendedFrequency || row.frequency,
      duration: aiResult.recommendedDuration || row.duration,
    });
    setAiOpen(false);
    toast.success("AI suggestion applied — please verify");
  };

  return (
    <div className="rounded-md border p-2">
      <div className="grid gap-2 md:grid-cols-2">
        <div className="relative">
          <Input
            value={row.name}
            onChange={(e) => { onChange({ name: e.target.value }); setShowSug(true); }}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            placeholder="Medicine name (type 2+ letters)"
          />
          {showSug && (pharmRows.length > 0 || catalogSuggestions.length > 0 || pharmLoading) && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg">
              {pharmLoading && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">Searching pharmacy…</div>
              )}
              {pharmRows.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">In pharmacy stock</div>
              )}
              {pharmRows.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-secondary"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ name: m.name });
                    setShowSug(false);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{m.name}</span>
                    <span className={`text-[10px] ${m.stock_qty > 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {m.stock_qty > 0 ? `Stock: ${m.stock_qty}` : "Out of stock"}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {[m.generic_name, m.company].filter(Boolean).join(" · ")}
                    {m.sale_price != null && Number(m.sale_price) > 0 ? ` · Rs ${Number(m.sale_price).toLocaleString()}` : ""}
                  </div>
                </button>
              ))}
              {catalogSuggestions.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Catalog (not in pharmacy)</div>
                  {catalogSuggestions.map((s, idx) => (
                    <button
                      type="button"
                      key={`${s.name}-${idx}`}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-secondary"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        MEDICINE_FORM_CACHE.set(s.name, s);
                        onChange({ name: s.name, dose: s.strengths[0] || row.dose });
                        setShowSug(false);
                      }}
                    >
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground">{s.form} · {s.strengths.join(", ")}</div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
          {notInPharmacy && (
            <p className="mt-1 text-[11px] text-destructive">
              "{row.name.trim()}" is not available in this hospital's pharmacy.
            </p>
          )}
        </div>

        {picked?.strengths?.length ? (
          <Select value={row.dose} onValueChange={(v) => onChange({ dose: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Dose / strength" /></SelectTrigger>
            <SelectContent>
              {picked.strengths.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input value={row.dose} onChange={(e) => onChange({ dose: e.target.value })} placeholder="Dose (e.g. 500mg)" />
        )}
        <Select value={row.frequency} onValueChange={(v) => onChange({ frequency: v })}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Frequency" /></SelectTrigger>
          <SelectContent>
            {FREQUENCY_OPTIONS.map((f) => (
              <SelectItem key={f.code} value={formatFrequency(f.code)}>
                {f.code} — {f.label}{f.pattern ? ` (${f.pattern})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={row.duration} onChange={(e) => onChange({ duration: e.target.value })} placeholder="Duration (e.g. 5 days)" />
      </div>
      <div className="mt-2 flex gap-2">
        <Input value={row.instructions} onChange={(e) => onChange({ instructions: e.target.value })} placeholder="Instructions (e.g. after meals)" />
        <Button type="button" variant="outline" size="sm" onClick={runAi} title="AI dose suggestion">
          <Sparkles className="mr-1 h-3.5 w-3.5" /> AI
        </Button>
        {onRemove && <Button type="button" variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>}
      </div>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>AI dosing · {row.name}</DialogTitle></DialogHeader>
          {aiLoading ? (
            <div className="flex items-center justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : aiResult ? (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-2 rounded-md bg-secondary/40 p-2 text-xs">
                <div><p className="text-muted-foreground">Dose</p><p className="font-semibold">{aiResult.recommendedDose || "—"}</p></div>
                <div><p className="text-muted-foreground">Frequency</p><p className="font-semibold">{aiResult.recommendedFrequency || "—"}</p></div>
                <div><p className="text-muted-foreground">Duration</p><p className="font-semibold">{aiResult.recommendedDuration || "—"}</p></div>
              </div>
              {aiResult.ageSuitability && <p className="text-xs"><span className="font-semibold">Age suitability:</span> {aiResult.ageSuitability}</p>}
              {aiResult.warnings?.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                  <p className="font-semibold text-destructive">Warnings</p>
                  <ul className="list-disc pl-4">{aiResult.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}
              {aiResult.interactions?.length > 0 && (
                <div className="rounded-md border p-2 text-xs">
                  <p className="font-semibold">Interactions</p>
                  <ul className="list-disc pl-4">{aiResult.interactions.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}
              {aiResult.rationale && <p className="text-[11px] text-muted-foreground">{aiResult.rationale}</p>}
              <p className="text-[10px] italic text-muted-foreground">Verify before prescribing.</p>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No suggestion yet.</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiOpen(false)}>Close</Button>
            <Button onClick={applyAi} disabled={!aiResult}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============= Comprehensive 7-tab patient View dialog ============= */
const RADIOLOGY_KEYWORDS = ["x-ray", "xray", "x ray", "ct ", "ct-", "ctscan", "ct scan", "mri", "ultrasound", "usg", "sonography", "doppler", "mammogram", "pet ", "fluoroscopy", "echocardio", "echo"];

function isRadiologyTest(t: string) {
  const s = (t || "").toLowerCase();
  return RADIOLOGY_KEYWORDS.some((k) => s.includes(k));
}

function fmtAge(dob?: string | null) {
  if (!dob) return "—";
  const ms = Date.now() - new Date(dob).getTime();
  if (Number.isNaN(ms)) return "—";
  const yrs = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  return `${yrs} yrs`;
}

function PatientViewDialog({
  patientId, headerName, onClose, fnHistory, onEditRx,
}: {
  patientId: string;
  headerName?: string;
  onClose: () => void;
  fnHistory: (args: any) => Promise<any>;
  onEditRx?: (rx: any, visit: any, patient: any) => void;
}) {
  const histQ = useQuery({
    queryKey: ["doc-view", patientId],
    queryFn: () => fnHistory({ data: { patientId } }),
    enabled: !!patientId,
  });

  const p = histQ.data?.patient as any;
  const visits = (histQ.data?.visits ?? []) as any[];
  const labsAll = (histQ.data?.labs ?? []) as any[];
  const followUps = (histQ.data?.followUps ?? []) as any[];
  const diseases = (histQ.data?.diseases ?? []) as string[];

  const radiology = labsAll.filter((l) => (l.tests ?? []).some(isRadiologyTest));
  const lab = labsAll.filter((l) => !(l.tests ?? []).some(isRadiologyTest));

  const diagnoses = visits.flatMap((v) => (v.prescriptions ?? []).map((rx: any) => ({ at: v.scheduled_at, diagnosis: rx.diagnosis })).filter((x: any) => x.diagnosis));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Patient view{headerName ? ` · ${headerName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {histQ.isLoading || !p ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Tabs defaultValue="data" className="w-full">
            <TabsList className="flex w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="data"><ClipboardList className="mr-1 h-3.5 w-3.5" /> Data</TabsTrigger>
              <TabsTrigger value="diagnosis"><Activity className="mr-1 h-3.5 w-3.5" /> Diagnosis</TabsTrigger>
              <TabsTrigger value="ac"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> A.C.</TabsTrigger>
              <TabsTrigger value="rx"><FileText className="mr-1 h-3.5 w-3.5" /> Rx History</TabsTrigger>
              <TabsTrigger value="lab"><FlaskConical className="mr-1 h-3.5 w-3.5" /> Lab</TabsTrigger>
              <TabsTrigger value="rad"><Scan className="mr-1 h-3.5 w-3.5" /> Radiology</TabsTrigger>
              <TabsTrigger value="next"><CalendarClock className="mr-1 h-3.5 w-3.5" /> Next Checkup</TabsTrigger>
            </TabsList>

            {/* --- DATA --- */}
            <TabsContent value="data" className="mt-4">
              <Card className="p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" value={`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()} />
                  <Field label="Father / Guardian" value={p.father_name} />
                  <Field label="MRN" value={p.mrn} />
                  <Field label="PMR No." value={p.pmr_no} />
                  <Field label="CNIC" value={p.cnic} />
                  <Field label="Phone" value={p.phone} />
                  <Field label="Email" value={p.email} />
                  <Field label="Gender" value={p.gender} />
                  <Field label="Date of birth" value={p.dob ? `${p.dob} (${fmtAge(p.dob)})` : "—"} />
                  <Field label="Blood group" value={p.blood_group} />
                  <Field label="Weight" value={p.weight_kg ? `${p.weight_kg} kg` : "—"} />
                  <Field label="Address" value={p.address} className="sm:col-span-2" />
                  <Field label="Emergency contact" value={p.emergency_contact_name ? `${p.emergency_contact_name} · ${p.emergency_contact_phone ?? "—"}` : "—"} className="sm:col-span-2" />
                  <Field label="Insurance" value={p.insurance_provider ? `${p.insurance_provider}${p.insurance_number ? ` · #${p.insurance_number}` : ""}` : "—"} className="sm:col-span-2" />
                  <Field label="Default concession" value={`${Number(p.default_concession_percent || 0)}%`} />
                </div>
              </Card>
            </TabsContent>

            {/* --- DIAGNOSIS --- */}
            <TabsContent value="diagnosis" className="mt-4 space-y-3">
              <Card className="p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Disease history</p>
                {diseases.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">No diagnoses recorded yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {diseases.map((d, i) => <Badge key={i} variant="secondary" className="text-xs">{d}</Badge>)}
                  </div>
                )}
              </Card>
              <Card className="p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Diagnoses by visit</p>
                {diagnoses.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">No prescriptions with diagnosis.</p>
                ) : (
                  <div className="divide-y text-sm">
                    {diagnoses.map((d: any, i: number) => (
                      <div key={i} className="flex items-start justify-between gap-3 py-2">
                        <p className="font-medium">{d.diagnosis}</p>
                        <p className="shrink-0 text-xs text-muted-foreground">{new Date(d.at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* --- A.C. (Allergies & Conditions) --- */}
            <TabsContent value="ac" className="mt-4 space-y-3">
              <Card className="p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-destructive">Allergies</p>
                {(p.allergies?.length ?? 0) === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">No known allergies.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {p.allergies.map((a: string, i: number) => <Badge key={i} variant="destructive" className="text-xs">{a}</Badge>)}
                  </div>
                )}
              </Card>
              <Card className="p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Chronic conditions</p>
                {(p.chronic_conditions?.length ?? 0) === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">No chronic conditions.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {p.chronic_conditions.map((c: string, i: number) => <Badge key={i} variant="outline" className="text-xs">{c}</Badge>)}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* --- Rx HISTORY --- */}
            <TabsContent value="rx" className="mt-4 space-y-3">
              {visits.filter((v) => v.prescriptions?.length).length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No prescriptions in the last 3 months.</p>
              ) : visits.filter((v) => v.prescriptions?.length).map((v) => (
                <Card key={v.id} className="p-3">
                  <p className="text-xs font-semibold text-muted-foreground">{new Date(v.scheduled_at).toLocaleString()}</p>
                  {v.prescriptions.map((rx: any) => (
                    <button
                      key={rx.id}
                      type="button"
                      onClick={() => onEditRx?.(rx, v, p)}
                      className="mt-2 block w-full rounded-md border bg-secondary/30 p-2 text-left text-xs transition hover:bg-secondary/60 hover:border-primary/40"
                      title="Click to edit this prescription"
                    >
                      {rx.diagnosis && <p><strong>Diagnosis:</strong> {rx.diagnosis}</p>}
                      {Array.isArray(rx.medications) && rx.medications.length > 0 && (
                        <ul className="ml-4 list-disc">
                          {rx.medications.map((m: any, i: number) => (
                            <li key={i}><strong>{m.name}</strong>{m.dose ? ` ${m.dose}` : ""}{m.frequency ? ` · ${m.frequency}` : ""}{m.duration ? ` · ${m.duration}` : ""}{m.instructions ? ` — ${m.instructions}` : ""}</li>
                          ))}
                        </ul>
                      )}
                      {rx.notes && <p className="mt-1 text-muted-foreground">{rx.notes}</p>}
                      {onEditRx && <p className="mt-1 text-[10px] uppercase tracking-wide text-primary">Click to edit</p>}
                    </button>
                  ))}
                </Card>
              ))}
            </TabsContent>

            {/* --- LAB --- */}
            <TabsContent value="lab" className="mt-4 space-y-3">
              {lab.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No lab orders.</p>
              ) : lab.map((l) => <LabCard key={l.id} l={l} />)}
            </TabsContent>

            {/* --- RADIOLOGY --- */}
            <TabsContent value="rad" className="mt-4 space-y-3">
              {radiology.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No radiology studies ordered.</p>
              ) : radiology.map((l) => <LabCard key={l.id} l={l} />)}
            </TabsContent>

            {/* --- NEXT CHECKUP --- */}
            <TabsContent value="next" className="mt-4 space-y-3">
              <Card className="p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Scheduled follow-ups</p>
                {followUps.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">No follow-ups scheduled.</p>
                ) : (
                  <div className="divide-y text-sm">
                    {followUps.map((f) => {
                      const due = new Date(f.due_date);
                      const isPast = due.getTime() < Date.now() - 24 * 3600 * 1000;
                      return (
                        <div key={f.id} className="flex items-start justify-between gap-3 py-2">
                          <div>
                            <p className="font-medium">{due.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                            {f.notes && <p className="text-xs text-muted-foreground">{f.notes}</p>}
                          </div>
                          <Badge variant={isPast ? "outline" : "default"} className="text-[10px]">
                            {isPast ? "Past due" : "Upcoming"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function LabCard({ l }: { l: any }) {
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{(l.tests ?? []).join(", ")}</p>
          <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()} · {l.priority}</p>
        </div>
        <Badge variant={l.status === "completed" ? "default" : "outline"} className="text-[10px]">
          {l.status === "completed" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
          {l.status.replace("_", " ")}
        </Badge>
      </div>
      {l.results?.length > 0 && (
        <div className="mt-2 rounded-md border bg-secondary/30 p-2 text-xs">
          <table className="w-full">
            <thead><tr className="text-left text-muted-foreground"><th>Test</th><th>Value</th><th>Unit</th><th>Range</th><th>Flag</th></tr></thead>
            <tbody>
              {l.results.map((r: any) => (
                <tr key={r.id}><td>{r.test_name}</td><td>{r.value ?? "—"}</td><td>{r.unit ?? "—"}</td><td>{r.reference_range ?? "—"}</td><td>{r.flag ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ============= AI Prescription Assistant panel ============= */
type AiMedSuggestion = { name: string; dose: string; frequency: string; duration: string; instructions: string };

function PrescriptionAiPanel({
  diagnosis, patient, currentMeds, onAddMedication,
}: {
  diagnosis: string;
  patient: any;
  currentMeds: { name: string; dose: string; frequency: string; duration: string; instructions: string }[];
  onAddMedication: (m: AiMedSuggestion) => void;
}) {
  const fnGen = useServerFn(generatePrescription);
  const fnAsk = useServerFn(askDoctorAssistant);

  const [auto, setAuto] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const ageYears = (() => {
    const dob = patient?.dob || patient?.date_of_birth;
    if (!dob) return 30;
    const ms = Date.now() - new Date(dob).getTime();
    if (Number.isNaN(ms)) return 30;
    return Math.max(0, Math.floor(ms / (365.25 * 24 * 3600 * 1000)));
  })();
  const weight = patient?.weight_kg ? Number(patient.weight_kg) : undefined;
  const allergies = (patient?.allergies ?? []).join(", ");
  const conditions = (patient?.chronic_conditions ?? []).join(", ");

  // Auto-suggest meds when diagnosis changes (debounced)
  useEffect(() => {
    const dx = diagnosis.trim();
    if (dx.length < 3) { setAuto(null); setError(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const r: any = await fnGen({ data: {
          diagnosis: dx,
          patientAge: ageYears,
          patientSex: patient?.gender || undefined,
          patientWeight: weight,
          allergies: allergies || undefined,
          chronicConditions: conditions || undefined,
          currentMeds: currentMeds.filter((m) => m.name.trim()).map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}`).join(", ") || undefined,
          notes: undefined,
        }});
        if (cancelled) return;
        if (r?.ok) setAuto(r.result);
        else setError(r?.error || "AI failed");
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "AI failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 900);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosis, ageYears, weight, allergies, conditions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length, asking]);

  const send = async () => {
    const q = ask.trim();
    if (!q || asking) return;
    setAsk("");
    const history = [...chat, { role: "user" as const, content: q }];
    setChat(history);
    setAsking(true);
    try {
      const ctx = `Patient: ${ageYears}y, ${patient?.gender ?? "?"}${weight ? `, ${weight}kg` : ""}. ` +
        `Allergies: ${allergies || "none"}. Conditions: ${conditions || "none"}. ` +
        `Diagnosis: ${diagnosis || "n/a"}.`;
      const r: any = await fnAsk({ data: {
        question: `${ctx}\n\nQuestion: ${q}`,
        history: chat.slice(-10),
      }});
      if (r?.ok) setChat([...history, { role: "assistant", content: r.answer }]);
      else setChat([...history, { role: "assistant", content: `⚠️ ${r?.error || "AI failed"}` }]);
    } catch (e: any) {
      setChat([...history, { role: "assistant", content: `⚠️ ${e?.message || "AI failed"}` }]);
    } finally {
      setAsking(false);
    }
  };

  const meds: AiMedSuggestion[] = (auto?.medications ?? []).map((m: any) => ({
    name: m.name || "",
    dose: m.dosage || "",
    frequency: m.frequency || "",
    duration: m.duration || "",
    instructions: [m.route, m.instructions].filter(Boolean).join(" — "),
  })).filter((m: AiMedSuggestion) => m.name);

  return (
    <div className="flex h-[520px] flex-col gap-2 rounded-md border bg-secondary/20 p-2">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Prescription Assistant
        </div>
        <Badge variant="outline" className="text-[10px]">
          {ageYears}y · {patient?.gender ?? "?"}{weight ? ` · ${weight}kg` : ""}
        </Badge>
      </div>

      {/* Auto-suggestions */}
      <div className="overflow-y-auto pr-1" style={{ maxHeight: 260 }}>
        {!diagnosis.trim() ? (
          <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Enter a diagnosis to get AI-suggested medications, doses, warnings, and interactions tailored to this patient.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing diagnosis & patient history…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>
        ) : auto ? (
          <div className="space-y-2">
            {meds.length > 0 && (
              <div className="rounded-md border bg-background p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Suggested medications ({meds.length})</p>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => meds.forEach(onAddMedication)}>
                    <Plus className="mr-1 h-3 w-3" /> Add all
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {meds.map((m, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 rounded border bg-secondary/30 p-1.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {m.instructions && <p className="text-[10px] text-muted-foreground">{m.instructions}</p>}
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[10px]" onClick={() => onAddMedication(m)}>
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {auto.precautions?.length > 0 && (
              <div className="rounded-md border bg-background p-2 text-xs">
                <p className="mb-1 font-semibold">Precautions</p>
                <ul className="ml-4 list-disc space-y-0.5">{auto.precautions.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            {auto.warnings?.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                <p className="mb-1 flex items-center gap-1 font-semibold text-destructive"><AlertTriangle className="h-3 w-3" /> Warnings</p>
                <ul className="ml-4 list-disc space-y-0.5">{auto.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            {auto.interactionAlerts?.length > 0 && (
              <div className="rounded-md border bg-background p-2 text-xs">
                <p className="mb-1 font-semibold">Drug interactions</p>
                <ul className="ml-4 list-disc space-y-0.5">{auto.interactionAlerts.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            {auto.followUp && (
              <div className="rounded-md border bg-background p-2 text-xs">
                <p className="font-semibold">Follow-up</p>
                <p className="text-muted-foreground">{auto.followUp}</p>
              </div>
            )}

            <p className="text-[10px] italic text-muted-foreground">{auto.disclaimer || "Physician must verify and sign."}</p>
          </div>
        ) : null}
      </div>

      {/* Chat */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-md border bg-background">
        <div className="flex items-center justify-between border-b px-2 py-1">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Ask the assistant</p>
          {chat.length > 0 && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px]" onClick={() => setChat([])}>Clear</Button>
          )}
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-2 text-xs">
          {chat.length === 0 && !asking ? (
            <p className="text-center text-[11px] text-muted-foreground">
              Ask about doses, interactions, alternatives, or contraindications.
            </p>
          ) : (
            chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-6 rounded-md bg-primary px-2 py-1.5 text-primary-foreground" : "mr-6 rounded-md bg-secondary px-2 py-1.5"}>
                <p className="whitespace-pre-wrap leading-snug">{m.content}</p>
              </div>
            ))
          )}
          {asking && (
            <div className="mr-6 flex items-center gap-2 rounded-md bg-secondary px-2 py-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <form
          className="flex gap-1 border-t p-1.5"
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          <Input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="e.g. Safe alternative if penicillin allergic?"
            className="h-7 text-xs"
            disabled={asking}
          />
          <Button type="submit" size="sm" className="h-7 px-2" disabled={asking || !ask.trim()}>
            <Sparkles className="h-3 w-3" />
          </Button>
        </form>
      </div>
    </div>
  );
}
