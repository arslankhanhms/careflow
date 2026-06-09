import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Users, LogOut, CalendarDays, LayoutDashboard, TrendingUp, Search, CalendarPlus, Stethoscope, FileDown, Sparkles, MessageSquare, FileText } from "lucide-react"; 
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { DoctorAiAssistant } from "@/components/doctor-ai-assistant";
import { useAuth } from "@/hooks/use-auth";
import { getMyDoctorPatients, getMyDoctorPatientProfile, scheduleNextCheckup } from "@/lib/dashboard.functions";
import { formatMRN } from "@/lib/prescriptions";
import { downloadPatientSummaryPdf } from "@/lib/patient-summary-pdf";
import { toast } from "sonner";

export const Route = createFileRoute("/doctor/patients")({
  head: () => ({ meta: [{ title: "My Patients — Doctor" }] }),
  component: DoctorPatientsPage,
});

function age(dob?: string | null) {
  if (!dob) return "—";
  const ms = Date.now() - new Date(dob).getTime();
  if (Number.isNaN(ms)) return "—";
  return Math.max(0, Math.floor(ms / (365.25 * 24 * 3600 * 1000))) + "y";
}

function DoctorPatientsPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fnList = useServerFn(getMyDoctorPatients);
  const fnProfile = useServerFn(getMyDoctorPatientProfile);
  const fnSchedule = useServerFn(scheduleNextCheckup);

  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openRx, setOpenRx] = useState<any | null>(null);
  const [checkupOpen, setCheckupOpen] = useState(false);
  const [checkupDate, setCheckupDate] = useState("");
  const [checkupNotes, setCheckupNotes] = useState("");

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [user, loading]);

  const listQ = useQuery({ queryKey: ["my-patients"], queryFn: () => fnList(), enabled: !!user });
  const profileQ = useQuery({
    queryKey: ["my-patient", openId],
    queryFn: () => fnProfile({ data: { patientId: openId! } }),
    enabled: !!openId,
  });

  const scheduleMut = useMutation({
    mutationFn: (v: any) => fnSchedule({ data: v }),
    onSuccess: () => {
      toast.success("Next checkup scheduled");
      setCheckupOpen(false); setCheckupDate(""); setCheckupNotes("");
      qc.invalidateQueries({ queryKey: ["my-patient", openId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const patients = (listQ.data?.patients ?? []) as any[];
  const filtered = search.trim()
    ? patients.filter((p) => `${p.first_name} ${p.last_name} ${p.mrn} ${p.phone || ""}`.toLowerCase().includes(search.toLowerCase()))
    : patients;

  const sidebar: SidebarSection[] = [{
    items: [
      { label: "Overview", to: "/doctor/overview", icon: LayoutDashboard },
      { label: "Today's Appointments", to: "/doctor/appointments", icon: CalendarDays },
      { label: "My Schedule", to: "/doctor/schedule", icon: LayoutDashboard },
      { label: "My Patients", to: "/doctor/patients", icon: Users },
      { label: "Patient Reports", to: "/doctor/reports", icon: FileText },
      { label: "Closure Requests", to: "/doctor/closures", icon: FileText },
      { label: "My Earnings", to: "/doctor/earnings", icon: TrendingUp },
      { label: "Messages", to: "/doctor/messages", icon: MessageSquare },
      { label: "AI Assistant", to: "/doctor/ai-assistant", icon: Sparkles },
    ],
  }];
  const footer = (
    <Button size="sm" variant="outline" className="w-full" onClick={signOut}>
      <LogOut className="mr-1.5 h-3 w-3" /> Sign out
    </Button>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar sections={sidebar} footer={footer} />
      <div className="flex flex-1 flex-col">
        <AppTopbar title="My Patients" subtitle={user?.email ?? undefined}
          right={<Badge variant="outline" className="text-[10px]">Doctor</Badge>} />
        <main className="mx-auto w-full max-w-7xl space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">My patients</h1>
              <p className="text-sm text-muted-foreground">{patients.length} patients under your care.</p>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, MRN, phone" className="pl-8" />
            </div>
          </div>

          <Card className="p-0">
            {listQ.isLoading ? (
              <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No patients found.</div>
            ) : (
              <div className="divide-y">
                {filtered.map((p) => (
                  <button key={p.id} type="button" onClick={() => setOpenId(p.id)}
                    className="flex w-full items-center justify-between p-4 text-left transition hover:bg-secondary/40">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {p.first_name?.[0]}{p.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{p.first_name} {p.last_name}
                          {p.blood_group && <Badge variant="outline" className="ml-2 text-[10px]">{p.blood_group}</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatMRN(p.mrn)} · {age(p.dob)} {p.gender ? `· ${p.gender}` : ""} {p.phone ? `· ${p.phone}` : ""}</p>
                        {p.last_diagnosis && <p className="mt-0.5 text-[11px] italic text-muted-foreground">Dx: {p.last_diagnosis}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-right">
                        <p className="font-semibold">{p.visits} visits</p>
                        <p className="text-muted-foreground">{p.rx_count} prescriptions</p>
                      </div>
                      <div className="text-right text-muted-foreground">
                        {p.last_seen ? new Date(p.last_seen).toLocaleDateString() : "—"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </main>
      </div>

      {/* Patient profile dialog */}
      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {profileQ.isLoading || !profileQ.data ? (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  {profileQ.data.patient?.first_name} {profileQ.data.patient?.last_name}
                  <Badge variant="outline" className="ml-2 text-[10px]">{formatMRN(profileQ.data.patient?.mrn)}</Badge>
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => {
                    try {
                      downloadPatientSummaryPdf({
                        patient: profileQ.data.patient as any,
                        appointments: profileQ.data.appointments as any,
                        prescriptions: profileQ.data.prescriptions as any,
                      });
                    } catch (e: any) { toast.error(e?.message || "Could not generate PDF"); }
                  }}>
                    <FileDown className="mr-1 h-3.5 w-3.5" /> Download summary
                  </Button>
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-3 md:grid-cols-4">
                <Card className="p-3"><p className="text-[10px] text-muted-foreground">Age</p><p className="text-sm font-semibold">{age(profileQ.data.patient?.dob)}</p></Card>
                <Card className="p-3"><p className="text-[10px] text-muted-foreground">Gender</p><p className="text-sm font-semibold capitalize">{profileQ.data.patient?.gender || "—"}</p></Card>
                <Card className="p-3"><p className="text-[10px] text-muted-foreground">Blood</p><p className="text-sm font-semibold">{profileQ.data.patient?.blood_group || "—"}</p></Card>
                <Card className="p-3"><p className="text-[10px] text-muted-foreground">Phone</p><p className="text-sm font-semibold">{profileQ.data.patient?.phone || "—"}</p></Card>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Card className="p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Allergies</p>
                  <p className="mt-1 text-sm">{(profileQ.data.patient?.allergies as string[])?.join(", ") || "None recorded"}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Chronic conditions</p>
                  <p className="mt-1 text-sm">{(profileQ.data.patient?.chronic_conditions as string[])?.join(", ") || "None recorded"}</p>
                </Card>
              </div>

              <Card className="p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Active complaints & recent symptoms</p>
                {((profileQ.data as any).activeComplaints || []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {((profileQ.data as any).activeComplaints || []).slice(0, 12).map((c: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[11px]">{c}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No active complaints recorded.</p>
                )}
              </Card>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Prescription history ({profileQ.data.prescriptions.length})</p>
                  <Button size="sm" variant="outline" onClick={() => setCheckupOpen(true)}>
                    <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Schedule next checkup
                  </Button>
                </div>
                <div className="space-y-2">
                  {profileQ.data.prescriptions.slice(0, 6).map((p: any) => (
                    <button
                      key={p.id} type="button"
                      onClick={() => setOpenRx(p)}
                      className="w-full rounded-md border p-2 text-left transition hover:border-primary hover:bg-secondary/30"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{new Date(p.issued_at).toLocaleDateString()}</span>
                        <span className="text-muted-foreground">{p.diagnosis || "—"}</span>
                      </div>
                      {Array.isArray(p.medications) && p.medications.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-[11px] text-muted-foreground">
                          {p.medications.slice(0, 5).map((m: any, i: number) => (
                            <li key={i}>{m.name}{m.dose ? ` ${m.dose}` : ""}{m.frequency ? ` · ${m.frequency}` : ""}{m.duration ? ` · ${m.duration}` : ""}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-primary">Click to view full prescription</p>
                    </button>
                  ))}
                  {profileQ.data.prescriptions.length === 0 && <p className="text-xs text-muted-foreground">No prescriptions.</p>}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Card className="p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Recent visits ({profileQ.data.appointments.length})</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {profileQ.data.appointments.slice(0, 8).map((a: any) => (
                      <li key={a.id} className="flex justify-between">
                        <span>{new Date(a.scheduled_at).toLocaleDateString()}</span>
                        <span className="text-muted-foreground">{a.status} {a.reason ? `· ${a.reason}` : ""}</span>
                      </li>
                    ))}
                    {profileQ.data.appointments.length === 0 && <li className="text-muted-foreground">No visits yet.</li>}
                  </ul>
                </Card>
                <Card className="p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Lab orders ({profileQ.data.labOrders.length})</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {profileQ.data.labOrders.slice(0, 8).map((l: any) => (
                      <li key={l.id} className="flex justify-between">
                        <span>{new Date(l.created_at).toLocaleDateString()}</span>
                        <span className="text-muted-foreground truncate">{(l.tests || []).join(", ")}</span>
                      </li>
                    ))}
                    {profileQ.data.labOrders.length === 0 && <li className="text-muted-foreground">No lab orders.</li>}
                  </ul>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule next checkup */}
      <Dialog open={checkupOpen} onOpenChange={setCheckupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Schedule next checkup</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Due date</Label><Input type="date" value={checkupDate} onChange={(e) => setCheckupDate(e.target.value)} /></div>
            <div><Label>Notes (optional)</Label><Input value={checkupNotes} onChange={(e) => setCheckupNotes(e.target.value)} placeholder="e.g. BP follow-up" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCheckupOpen(false)}>Cancel</Button>
            <Button onClick={() => scheduleMut.mutate({ patientId: openId, dueDate: checkupDate, notes: checkupNotes })}
              disabled={!checkupDate || scheduleMut.isPending}>
              {scheduleMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* View prescription details */}
      <Dialog open={!!openRx} onOpenChange={(o) => !o && setOpenRx(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              Prescription · {openRx ? new Date(openRx.issued_at).toLocaleString() : ""}
            </DialogTitle>
          </DialogHeader>
          {openRx && (
            <div className="space-y-4 text-sm">
              {openRx.diagnosis && (
                <div><p className="text-[11px] font-semibold uppercase text-muted-foreground">Diagnosis</p><p>{openRx.diagnosis}</p></div>
              )}
              {Array.isArray(openRx.symptoms) && openRx.symptoms.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Symptoms</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {openRx.symptoms.map((s: string, i: number) => <Badge key={i} variant="secondary" className="text-[11px]">{s}</Badge>)}
                  </div>
                </div>
              )}
              {openRx.examination && (
                <div><p className="text-[11px] font-semibold uppercase text-muted-foreground">Examination</p><p className="whitespace-pre-wrap">{openRx.examination}</p></div>
              )}
              {openRx.vitals && Object.keys(openRx.vitals || {}).length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Vitals</p>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {Object.entries(openRx.vitals).filter(([, v]) => v).map(([k, v]) => (
                      <Card key={k} className="p-2"><p className="text-[10px] uppercase text-muted-foreground">{k}</p><p className="font-semibold">{String(v)}</p></Card>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">Medications</p>
                {Array.isArray(openRx.medications) && openRx.medications.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {openRx.medications.map((m: any, i: number) => (
                      <li key={i} className="rounded-md border p-2 text-xs">
                        <p className="font-semibold">{m.name}{m.dose ? ` — ${m.dose}` : ""}</p>
                        <p className="text-muted-foreground">{[m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                        {m.instructions && <p className="mt-0.5 text-[11px] italic">{m.instructions}</p>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">None.</p>}
              </div>
              {Array.isArray(openRx.lab_tests) && openRx.lab_tests.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Lab tests ordered</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {openRx.lab_tests.map((t: string, i: number) => <Badge key={i} variant="outline" className="text-[11px]">{t}</Badge>)}
                  </div>
                </div>
              )}
              {openRx.suggested_treatment && (
                <div><p className="text-[11px] font-semibold uppercase text-muted-foreground">Suggested treatment</p><p className="whitespace-pre-wrap">{openRx.suggested_treatment}</p></div>
              )}
              {openRx.notes && (
                <div><p className="text-[11px] font-semibold uppercase text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{openRx.notes}</p></div>
              )}
              {(openRx.follow_up_date || openRx.follow_up_notes) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Follow-up</p>
                  <p>{openRx.follow_up_date ? new Date(openRx.follow_up_date).toLocaleDateString() : "—"}{openRx.follow_up_notes ? ` · ${openRx.follow_up_notes}` : ""}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {openRx?.appointment_id && (
              <Button variant="outline" onClick={() => { navigate({ to: "/doctor/appointments", search: { rx: openRx.appointment_id } as any }); }}>
                Edit in appointment
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpenRx(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DoctorAiAssistant />
    </div>
  );
}
