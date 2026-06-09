import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Calendar, Receipt, Pill, Bell, FileText, LogOut, Plus, X, CalendarClock, Printer, MessageCircle, Mail, User, Settings, LayoutDashboard, CalendarDays, Stethoscope } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyAppointments, getMyPortalData, cancelMyAppointment, reschedulePatientAppointment } from "@/lib/booking.functions";
import { getMyUnifiedPortal, sharePrescriptionViaWhatsapp } from "@/lib/patient-portal.functions";
import { Building2, FlaskConical } from "lucide-react";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { PatientReportsSection } from "@/components/patient-reports-section";

import { getReceipt } from "@/lib/schedule.functions";
import jsPDF from "jspdf";
import { buildPrescriptionDoc, type PrescriptionData } from "@/lib/prescription-pdf";
import { generateReceiptFromPaymentId } from "@/lib/receipt-builder";

function emitPdf(doc: jsPDF, filename: string, mode: "save" | "print") {
  if (mode === "print") {
    doc.autoPrint();
    const url = doc.output("bloburl");
    window.open(url, "_blank");
  } else {
    doc.save(filename);
  }
}

async function downloadReceipt(fnReceipt: any, paymentId: string, mode: "save" | "print" = "save") {
  try {
    await generateReceiptFromPaymentId(fnReceipt, paymentId, mode);
  } catch (e: any) { toast.error(e?.message || "Failed to generate receipt"); }
}

function buildPrescriptionText(p: any): string {
  const meds = ((p.medications as any[]) || []).map((m, i) =>
    `${i + 1}. ${m.name || ""} — ${m.dosage || ""}${m.frequency ? ` · ${m.frequency}` : ""}${m.duration ? ` · ${m.duration}` : ""}${m.instructions ? `\n   (${m.instructions})` : ""}`
  ).join("\n");
  return [
    `Prescription — ${p.hospital?.name ?? ""}`,
    p.doctor ? `Doctor: ${p.doctor.display_name}${p.doctor.specialization ? ` (${p.doctor.specialization})` : ""}` : null,
    `Date: ${new Date(p.issued_at).toLocaleString()}`,
    p.diagnosis ? `Diagnosis: ${p.diagnosis}` : null,
    "",
    meds || "No medications listed.",
    p.notes ? `\nNotes: ${p.notes}` : null,
  ].filter(Boolean).join("\n");
}

function emailPrescription(p: any, toEmail?: string) {
  const subject = `Prescription — ${p.hospital?.name ?? "Hospital"} — ${new Date(p.issued_at).toLocaleDateString()}`;
  const body = buildPrescriptionText(p);
  const href = `mailto:${toEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

function buildRxData(p: any, patient: any): PrescriptionData {
  return {
    hospital: p.hospital ?? null,
    doctor: p.doctor ?? null,
    patient: patient ?? null,
    appointment: p.appointment ?? null,
    diagnosis: p.diagnosis ?? "",
    notes: p.notes ?? "",
    vitals: p.vitals ?? {},
    medications: ((p.medications as any[]) || []).map((m: any) => ({
      name: m.name || "",
      dose: m.dose || m.dosage || "",
      frequency: m.frequency || "",
      duration: m.duration || "",
      instructions: m.instructions || "",
    })),
    issuedAt: p.issued_at || new Date(),
  };
}

function downloadPrescription(p: any, patient: any, mode: "save" | "print" = "save") {
  try {
    const doc = buildPrescriptionDoc(buildRxData(p, patient));
    emitPdf(doc, `Prescription-${new Date(p.issued_at).toISOString().slice(0, 10)}.pdf`, mode);
  } catch (e: any) { toast.error(e?.message || "Failed to generate PDF"); }
}

export const Route = createFileRoute("/patient/dashboard")({
  head: () => ({ meta: [{ title: "Patient dashboard — MediFlow AI" }] }),
  component: PatientDashboard,
});

function PatientDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const fnAppts = useServerFn(getMyAppointments);
  const fnPortal = useServerFn(getMyPortalData);
  const fnUnified = useServerFn(getMyUnifiedPortal);
  const fnCancel = useServerFn(cancelMyAppointment);
  const fnReceipt = useServerFn(getReceipt);
  const fnReschedule = useServerFn(reschedulePatientAppointment);
  const fnShareWa = useServerFn(sharePrescriptionViaWhatsapp);

  const [data, setData] = useState<any>({ appointments: [], patients: [] });
  const [portal, setPortal] = useState<any>({ prescriptions: [], payments: [], followUps: [] });
  const [unified, setUnified] = useState<any>({ hospitals: [], labOrders: [], cnic: null });
  const [loading, setLoading] = useState(true);
  const [reschedFor, setReschedFor] = useState<any>(null);
  const [reschedDate, setReschedDate] = useState<string>("");

  const shareWhatsapp = async (p: any) => {
    try {
      const r = await fnShareWa({ data: { prescriptionId: p.id } });
      if (r?.ok) toast.success("Prescription sent to your WhatsApp");
      else if (r?.skipped === "no_credentials" || r?.skipped === "channel_disabled" || r?.skipped === "no_from_number") {
        const phone = encodeURIComponent((unified.patients?.[0]?.phone || "").replace(/[^\d+]/g, ""));
        const text = encodeURIComponent(buildPrescriptionText(p));
        window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
      } else if (r?.skipped === "no_phone") {
        toast.error("No phone number on file");
      }
    } catch (e: any) { toast.error(e?.message || "Failed to send"); }
  };

  const [reschedLoading, setReschedLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/patient/login" }); return; }
    // Block staff accounts from the patient portal
    import("@/integrations/supabase/client").then(async ({ supabase }) => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1);
      if (roles && roles.length > 0) {
        await signOut();
        toast.error("Staff accounts must use the workspace sign-in.");
        navigate({ to: "/login" });
        return;
      }
      Promise.all([fnAppts(), fnPortal(), fnUnified()])
        .then(([a, p, u]: any) => {
          // Prefer the unified (cross-hospital, CNIC-linked) data when CNIC is set.
          if (u?.cnic && (u.appointments?.length || u.patients?.length)) {
            setData({ appointments: u.appointments, patients: u.patients });
            setPortal({ prescriptions: u.prescriptions, payments: u.payments, followUps: u.followUps });
          } else {
            setData(a); setPortal(p);
          }
          setUnified(u);
        })
        .catch((e) => toast.error(e?.message || "Failed to load"))
        .finally(() => setLoading(false));
    });
  }, [user, authLoading]);

  // Realtime: refetch portal data when this patient's appointments/payments change
  useEffect(() => {
    if (!user) return;
    let ch: any;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      ch = supabase.channel("patient-portal-" + user.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
          Promise.all([fnAppts(), fnPortal(), fnUnified()]).then(([a, p, u]: any) => {
            if (u?.cnic && (u.appointments?.length || u.patients?.length)) {
              setData({ appointments: u.appointments, patients: u.patients });
              setPortal({ prescriptions: u.prescriptions, payments: u.payments, followUps: u.followUps });
            } else { setData(a); setPortal(p); }
            setUnified(u);
          }).catch(() => {});
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
          fnPortal().then((p: any) => setPortal(p)).catch(() => {});
        })
        .subscribe();
    });
    return () => { if (ch) import("@/integrations/supabase/client").then(({ supabase }) => supabase.removeChannel(ch)); };
  }, [user?.id]);

  const cancel = async (id: string) => {
    try {
      await fnCancel({ data: { appointmentId: id } });
      toast.success("Appointment cancelled");
      const next = await fnAppts(); setData(next);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const submitReschedule = async () => {
    if (!reschedFor || !reschedDate) return;
    const start = new Date(reschedDate);
    if (isNaN(start.getTime())) { toast.error("Invalid date/time"); return; }
    const end = new Date(start.getTime() + 15 * 60_000);
    setReschedLoading(true);
    try {
      await fnReschedule({ data: { appointmentId: reschedFor.id, slotStart: start.toISOString(), slotEnd: end.toISOString() } });
      toast.success("Appointment rescheduled");
      setReschedFor(null);
      const next = await fnAppts(); setData(next);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setReschedLoading(false); }
  };

  if (authLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const upcoming = data.appointments.filter((a: any) => new Date(a.scheduled_at) >= new Date() && a.status !== "cancelled");
  const past = data.appointments.filter((a: any) => !(new Date(a.scheduled_at) >= new Date() && a.status !== "cancelled"));
  const pmr = data.patients[0]?.pmr_no;

  const patientSidebar: SidebarSection[] = [{
    items: [
      { label: "Dashboard", to: "/patient/dashboard", icon: LayoutDashboard },
      { label: "Find a Doctor", to: "/find-doctor", icon: Stethoscope },
    ],
  }];

  const handleSignOut = async () => { await signOut(); navigate({ to: "/" }); };
  const sidebarFooter = (
    <Button size="sm" variant="outline" className="w-full" onClick={handleSignOut}>
      <LogOut className="mr-1.5 h-3 w-3" /> Sign out
    </Button>
  );
  const topbarRight = pmr ? (
    <Badge variant="outline" className="font-mono text-[10px]">{pmr}</Badge>
  ) : undefined;

  return (
    <div className="flex min-h-screen w-full bg-secondary/30">
      <AppSidebar sections={patientSidebar} footer={sidebarFooter} />
      <div className="flex flex-1 flex-col">
        <AppTopbar
          title="Patient portal"
          subtitle={user?.email ?? undefined}
          right={topbarRight}
        />
      <main className="mx-auto w-full max-w-6xl px-6 py-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Manage your appointments, prescriptions and receipts.</p>
          </div>
          <Button asChild className="bg-gradient-brand text-primary-foreground hover:opacity-95">
            <Link to="/find-doctor"><Plus className="mr-1.5 h-4 w-4" /> Book new appointment</Link>
          </Button>
        </div>

        {unified.cnic && unified.hospitals.length > 0 && (
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary-soft/40 p-3 text-xs">
            <span className="font-medium">Unified view active.</span> Showing records from{" "}
            <span className="font-semibold">{unified.hospitals.length}</span> hospital{unified.hospitals.length === 1 ? "" : "s"} linked to your CNIC{" "}
            <span className="font-mono">{unified.cnic}</span>.
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-5">
          <Stat icon={Building2} label="Hospitals" value={unified.hospitals?.length ?? 0} />
          <Stat icon={Calendar} label="Upcoming" value={upcoming.length} />
          <Stat icon={Pill} label="Prescriptions" value={portal.prescriptions.length} />
          <Stat icon={Receipt} label="Payments" value={portal.payments.length} />
          <Stat icon={FlaskConical} label="Lab orders" value={unified.labOrders?.length ?? 0} />
        </div>

        <Tabs defaultValue="appointments">
          <TabsList>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
            <TabsTrigger value="lab">Lab</TabsTrigger>
            <TabsTrigger value="reports">My Reports</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="followups">Follow-ups</TabsTrigger>
            <TabsTrigger value="hospitals">Hospitals</TabsTrigger>
          </TabsList>

          <TabsContent value="appointments" className="mt-4 space-y-3">
            {upcoming.length === 0 && past.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                No appointments yet. <Link to="/find-doctor" className="text-primary hover:underline">Book your first visit</Link>.
              </Card>
            )}
            {upcoming.length > 0 && <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</h3>}
            {upcoming.map((a: any) => <AppointmentCard key={a.id} a={a} onCancel={cancel} onReschedule={(x) => { setReschedFor(x); setReschedDate(new Date(x.scheduled_at).toISOString().slice(0,16)); }} />)}
            {past.length > 0 && <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h3>}
            {past.map((a: any) => <AppointmentCard key={a.id} a={a} />)}
          </TabsContent>

          <TabsContent value="prescriptions" className="mt-4 space-y-3">
            {portal.prescriptions.length === 0 && <Empty icon={Pill} label="No prescriptions yet" />}
            {portal.prescriptions.map((p: any) => {
              const patient = (data.patients || []).find((x: any) => x.id === p.patient_id) || (data.patients || [])[0];
              return (
              <Card key={p.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.diagnosis || "Prescription"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.issued_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{(p.medications as any[])?.length ?? 0} meds</Badge>
                    <Button size="sm" variant="outline" onClick={() => downloadPrescription(p, patient)}>
                      <FileText className="mr-1 h-3 w-3" /> Download
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadPrescription(p, patient, "print")}>
                      <Printer className="mr-1 h-3 w-3" /> Print
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => shareWhatsapp(p)}>
                      <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => emailPrescription(p, user?.email ?? undefined)}>
                      <Mail className="mr-1 h-3 w-3" /> Email
                    </Button>
                  </div>
                </div>
                {(p.medications as any[])?.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {(p.medications as any[]).map((m: any, i: number) => (
                      <li key={i}>• {m.name} — {m.dose || m.dosage} {m.frequency && `· ${m.frequency}`} {m.duration && `· ${m.duration}`}</li>
                    ))}
                  </ul>
                )}
              </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="payments" className="mt-4 space-y-3">
            {(() => {
              // Deduplicate payments by appointment_id — keep the most "advanced" status
              // (completed/paid wins over pending) so the UI never shows two rows
              // for the same charge once the receptionist marks it paid.
              const rank: Record<string, number> = { completed: 3, paid: 3, refunded: 2, pending: 1, unpaid: 0 };
              const byKey = new Map<string, any>();
              for (const p of (portal.payments as any[]) || []) {
                const key = p.appointment_id || p.id;
                const prev = byKey.get(key);
                if (!prev || (rank[p.status] ?? 0) > (rank[prev.status] ?? 0)) byKey.set(key, p);
              }
              const list = Array.from(byKey.values()).sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              );
              if (list.length === 0) return <Empty icon={Receipt} label="No payments yet" />;
              return list.map((p: any) => {
                const isPaid = p.status === "paid" || p.status === "completed";
                const label = isPaid ? "completed" : p.status;
                return (
                <Card key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold">Rs {Number(p.amount).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{p.method} · {new Date(p.created_at).toLocaleString()}{p.receipt_no && ` · ${p.receipt_no}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={isPaid ? "default" : "secondary"}>{label}</Badge>
                    {isPaid && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => downloadReceipt(fnReceipt, p.id)}>
                        <FileText className="mr-1 h-3 w-3" /> Receipt
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadReceipt(fnReceipt, p.id, "print")}>
                        <Printer className="mr-1 h-3 w-3" /> Print
                      </Button>
                    </>
                  )}
                </div>
              </Card>
                );
              });
            })()}
          </TabsContent>

          <TabsContent value="followups" className="mt-4 space-y-3">
            {portal.followUps.length === 0 && <Empty icon={Bell} label="No follow-up dates assigned" />}
            {portal.followUps.map((f: any) => (
              <Card key={f.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-semibold">{new Date(f.due_date).toLocaleDateString()}</p>
                  {f.notes && <p className="text-xs text-muted-foreground">{f.notes}</p>}
                </div>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="lab" className="mt-4 space-y-3">
            {(unified.labOrders ?? []).length === 0 && <Empty icon={FlaskConical} label="No lab orders yet" />}
            {(() => {
              // Build a map of lab_order_id -> payment for receipt downloads
              const labPayMap = new Map<string, any>();
              for (const p of (portal.payments as any[]) || []) {
                const loId = p?.metadata?.lab_order_id;
                if (loId) labPayMap.set(loId, p);
              }
              return (unified.labOrders ?? []).map((l: any) => {
                const pay = labPayMap.get(l.id);
                const isPaid = !!pay && (pay.status === "paid" || pay.status === "completed");
                return (
              <Card key={l.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{(l.tests ?? []).join(", ") || "Lab order"}</p>
                    <p className="text-xs text-muted-foreground">{l.hospital?.name} · {new Date(l.created_at).toLocaleString()}</p>
                    {l.doctor?.display_name && <p className="text-xs text-muted-foreground">Ordered by {l.doctor.display_name}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={l.status === "completed" ? "default" : "secondary"} className="capitalize">{l.status.replace("_", " ")}</Badge>
                    {isPaid && (
                      <Badge variant="default" className="bg-emerald-600 text-white">Paid Rs {Number(pay.amount).toLocaleString()}</Badge>
                    )}
                  </div>
                </div>
                {isPaid && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/40 p-2">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Receipt</span> · {pay.receipt_no || pay.id.slice(0, 8)} · {pay.method} · {new Date(pay.created_at).toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => downloadReceipt(fnReceipt, pay.id)}>
                        <FileText className="mr-1 h-3 w-3" /> Receipt
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadReceipt(fnReceipt, pay.id, "print")}>
                        <Printer className="mr-1 h-3 w-3" /> Print
                      </Button>
                    </div>
                  </div>
                )}
                {l.results.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground"><tr>
                        <th className="px-2 py-1 text-left font-medium">Test</th>
                        <th className="px-2 py-1 text-left font-medium">Value</th>
                        <th className="px-2 py-1 text-left font-medium">Unit</th>
                        <th className="px-2 py-1 text-left font-medium">Reference</th>
                        <th className="px-2 py-1 text-left font-medium">Flag</th>
                      </tr></thead>
                      <tbody>
                        {l.results.map((r: any) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-2 py-1">{r.test_name}</td>
                            <td className="px-2 py-1 font-medium">{r.value ?? "—"}</td>
                            <td className="px-2 py-1">{r.unit ?? "—"}</td>
                            <td className="px-2 py-1 text-muted-foreground">{r.reference_range ?? "—"}</td>
                            <td className="px-2 py-1">{r.flag ? <Badge variant={r.flag.toLowerCase().includes("h") || r.flag.toLowerCase().includes("l") ? "destructive" : "secondary"}>{r.flag}</Badge> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
                );
              });
            })()}
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <PatientReportsSection />
          </TabsContent>

          <TabsContent value="hospitals" className="mt-4 space-y-3">
            {(unified.hospitals ?? []).length === 0 && <Empty icon={Building2} label="No linked hospitals yet" />}
            {(unified.hospitals ?? []).map((h: any) => {
              const pat = unified.patients.find((p: any) => p.hospital_id === h.id);
              const apptCount = data.appointments.filter((a: any) => a.hospital_id === h.id).length;
              const rxCount = portal.prescriptions.filter((p: any) => p.hospital_id === h.id).length;
              const labCount = (unified.labOrders ?? []).filter((l: any) => l.hospital_id === h.id).length;
              return (
                <Card key={h.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary"><Building2 className="h-5 w-5" /></div>
                      <div>
                        <p className="text-sm font-semibold">{h.name}</p>
                        <p className="text-xs text-muted-foreground">{h.city ?? "—"} · MRN: <span className="font-mono">{pat?.mrn ?? "—"}</span></p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{apptCount} visits</Badge>
                      <Badge variant="secondary">{rxCount} Rx</Badge>
                      <Badge variant="secondary">{labCount} labs</Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!reschedFor} onOpenChange={(o) => !o && setReschedFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Reschedule appointment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Pick a new date and time. The hospital will be notified and your queue number updated.</p>
          <div className="space-y-2">
            <Label>New date &amp; time</Label>
            <Input type="datetime-local" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedFor(null)}>Cancel</Button>
            <Button disabled={reschedLoading || !reschedDate} onClick={async () => {
              const start = new Date(reschedDate);
              if (isNaN(start.getTime())) { toast.error("Invalid date/time"); return; }
              const end = new Date(start.getTime() + 15 * 60_000);
              setReschedLoading(true);
              try {
                await fnReschedule({ data: { appointmentId: reschedFor.id, slotStart: start.toISOString(), slotEnd: end.toISOString() } });
                toast.success("Appointment rescheduled");
                setReschedFor(null);
                const next = await fnAppts(); setData(next);
              } catch (e: any) { toast.error(e?.message || "Failed"); }
              finally { setReschedLoading(false); }
            }}>
              {reschedLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
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
function Empty({ icon: Icon, label }: any) {
  return (
    <Card className="p-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}
function AppointmentCard({ a, onCancel, onReschedule }: { a: any; onCancel?: (id: string) => void; onReschedule?: (a: any) => void }) {
  const upcoming = new Date(a.scheduled_at) >= new Date() && a.status !== "cancelled";
  return (
    <Card className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-semibold">{a.doctor?.display_name || "Doctor"} <span className="font-normal text-muted-foreground">· {a.doctor?.specialization}</span></p>
        <p className="text-xs text-muted-foreground">{a.hospital?.name} — {new Date(a.scheduled_at).toLocaleString()}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">Status: {a.status}</Badge>
          {a.queue_no && <Badge className="bg-primary-soft text-primary text-[10px]">Queue #{a.queue_no}</Badge>}
          <Badge variant={a.payment_status === "paid" ? "default" : "secondary"} className="text-[10px]">{a.payment_status}</Badge>
        </div>
      </div>
      {upcoming && (
        <div className="flex gap-2">
          {onReschedule && <Button size="sm" variant="outline" onClick={() => onReschedule(a)}><CalendarClock className="mr-1 h-3 w-3" /> Reschedule</Button>}
          {onCancel && <Button size="sm" variant="outline" onClick={() => onCancel(a.id)}><X className="mr-1 h-3 w-3" /> Cancel</Button>}
        </div>
      )}
    </Card>
  );
}
