import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ModulePage, NewBtn, StatCard } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  listPatients, createPatient, deletePatient, listHospitalDoctors,
  getMyDoctorContext, createPatientPrescription,
} from "@/lib/patients.functions";
import { listPharmacyItems } from "@/lib/pharmacy.functions";
import { getMyHospitalRole } from "@/lib/staff.functions";
import {
  Loader2, Trash2, UserPlus, Database, Search, Pill, Plus, X,
  Printer, Download, Stethoscope, Phone, Building2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import jsPDF from "jspdf";

export const Route = createFileRoute("/hospital/$slug/patients")({
  head: () => ({ meta: [{ title: "Patients — MediFlow AI" }] }),
  component: PatientsPage,
});

type Med = { name: string; dose?: string; frequency?: string; duration?: string; instructions?: string };

function PatientsPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const list = useServerFn(listPatients);
  const create = useServerFn(createPatient);
  const del = useServerFn(deletePatient);
  const roleFn = useServerFn(getMyHospitalRole);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rxPatient, setRxPatient] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ["patients", slug],
    queryFn: () => list({ data: { slug } }),
    enabled: !!user,
  });
  const roleQ = useQuery({
    queryKey: ["my-role", slug],
    queryFn: () => roleFn({ data: { slug } }),
    enabled: !!user,
  });
  const role: string | null = (roleQ.data as any)?.role ?? null;
  const canMutate = !!role && !["hospital_admin", "owner", "accountant", "blood_bank", "radiology"].includes(role);
  const isDoctor = role === "doctor";

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => create({ data: data as never }),
    onSuccess: () => { toast.success("Patient registered"); setOpen(false); qc.invalidateQueries({ queryKey: ["patients", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Patient removed"); qc.invalidateQueries({ queryKey: ["patients", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const patients = q.data?.patients ?? [];
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return patients;
    return patients.filter((p: any) =>
      [p.mrn, p.cnic, p.phone, p.pmr_no, `${p.first_name} ${p.last_name}`]
        .filter(Boolean).some((v: string) => v.toLowerCase().includes(t))
    );
  }, [patients, query]);

  const totals = {
    total: patients.length,
    male: patients.filter((p) => p.gender === "male").length,
    female: patients.filter((p) => p.gender === "female").length,
    withAllergies: patients.filter((p) => Array.isArray(p.allergies) && p.allergies.length > 0).length,
  };

  return (
    <ModulePage title="Patients" subtitle="Live data · Lovable Cloud" actions={
      canMutate ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><div><NewBtn label="Register patient" /></div></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Register new patient</DialogTitle></DialogHeader>
            <PatientForm slug={slug} enabled={open && !!user} onSubmit={(data) => createMut.mutate({ slug, ...data })} loading={createMut.isPending} />
            <DialogFooter />
          </DialogContent>
        </Dialog>
      ) : (
        <span className="rounded-md border bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground">View-only access</span>
      )
    }>
      {!user && (
        <Card className="flex items-center justify-between border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-warning-foreground" />
            <div>
              <p className="text-sm font-semibold">Sign in to access patient records</p>
              <p className="text-xs text-muted-foreground">Patient data is RLS-protected and tied to your hospital workspace.</p>
            </div>
          </div>
          <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total patients" value={String(totals.total)} hint="In your hospital" />
        <StatCard label="Male" value={String(totals.male)} />
        <StatCard label="Female" value={String(totals.female)} />
        <StatCard label="With allergies" value={String(totals.withAllergies)} tone="warning" />
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by MRN, CNIC, phone or name…"
            className="pl-9"
          />
        </div>
      </Card>

      <Card className="p-0">
        {q.isLoading && <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>}
        {q.error && <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>}
        {q.data && patients.length === 0 && (
          <div className="flex flex-col items-center p-12 text-center">
            <UserPlus className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No patients yet</p>
            <p className="text-xs text-muted-foreground">Register your first patient to get started.</p>
          </div>
        )}
        {patients.length > 0 && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No patients match “{query}”.</div>
        )}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">MRN</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">CNIC</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Blood</th>
                  <th className="px-4 py-3 font-medium">Allergies</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-3 font-mono text-xs">{p.mrn}</td>
                    <td className="px-4 py-3 font-medium">{p.first_name} {p.last_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.cnic ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.phone ?? "—"}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{p.blood_group ?? "—"}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(p.allergies ?? []).slice(0, 3).map((a: string) => (
                          <Badge key={a} variant="outline" className="border-warning/30 bg-warning/10 text-warning-foreground">{a}</Badge>
                        ))}
                        {(!p.allergies || p.allergies.length === 0) && <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isDoctor && (
                          <Button size="sm" variant="secondary" onClick={() => setRxPatient(p)}>
                            <Pill className="mr-1 h-3.5 w-3.5" /> Prescribe
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link to="/hospital/$slug/patients/$patientId" params={{ slug, patientId: p.id }}>View</Link>
                        </Button>
                        {canMutate && (
                          <Button size="sm" variant="ghost" onClick={() => delMut.mutate(p.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rxPatient && (
        <PrescriptionDialog
          slug={slug}
          patient={rxPatient}
          onClose={() => setRxPatient(null)}
        />
      )}
    </ModulePage>
  );
}

/* ------------------- Prescription dialog ------------------- */

function PrescriptionDialog({ slug, patient, onClose }: { slug: string; patient: any; onClose: () => void }) {
  const ctxFn = useServerFn(getMyDoctorContext);
  const saveFn = useServerFn(createPatientPrescription);
  const pharmFn = useServerFn(listPharmacyItems);
  const ctxQ = useQuery({
    queryKey: ["my-doctor-ctx", slug],
    queryFn: () => ctxFn({ data: { slug } }),
  });
  const pharmQ = useQuery({
    queryKey: ["pharmacy-items", slug],
    queryFn: () => pharmFn({ data: { slug } }),
  });
  const [complaint, setComplaint] = useState("");
  const [observations, setObservations] = useState("");
  const [investigations, setInvestigations] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [meds, setMeds] = useState<Med[]>([]);
  const [saved, setSaved] = useState<any | null>(null);

  const ctx = ctxQ.data as any;
  const doctor = ctx?.doctor; const hospital = ctx?.hospital;
  const pharmacyItems = (pharmQ.data?.items ?? []) as any[];

  const saveMut = useMutation({
    mutationFn: () => saveFn({
      data: {
        patientId: patient.id,
        diagnosis: [diagnosis, observations && `Observations: ${observations}`, investigations && `Investigations: ${investigations}`, complaint && `Complaint: ${complaint}`].filter(Boolean).join(" | ") || undefined,
        notes: notes || undefined,
        next_checkup_date: nextDate || null,
        medications: meds.filter((m) => m.name.trim()).map((m) => ({
          name: m.name.trim(),
          dose: m.dose || undefined,
          frequency: m.frequency || undefined,
          duration: m.duration || undefined,
          instructions: m.instructions || undefined,
        })),
      } as any,
    }),
    onSuccess: (res: any) => {
      toast.success("Prescription sent to patient");
      setSaved(res.prescription);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  function updateMed(i: number, patch: Partial<Med>) {
    setMeds((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function addMed(name = "") { setMeds((m) => [...m, { name, dose: "", frequency: "", duration: "", instructions: "" }]); }
  function removeMed(i: number) { setMeds((m) => m.filter((_, idx) => idx !== i)); }

  const issuedDate = saved?.issued_at ? new Date(saved.issued_at) : new Date();

  function buildPdf() {
    const doc = new jsPDF();
    const ageYears = patient.dob ? Math.max(0, new Date().getFullYear() - new Date(patient.dob).getFullYear()) : null;

    // === HEADER: Logo (left) · Hospital (center) · Doctor (right) ===
    if (hospital?.logo_url) {
      try { doc.addImage(hospital.logo_url, "PNG", 14, 10, 22, 22); } catch { /* ignore */ }
    }
    // Hospital center
    doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text(hospital?.name ?? "Hospital", 105, 17, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80);
    const addr = [hospital?.address, hospital?.city].filter(Boolean).join(", ");
    if (addr) doc.text(addr, 105, 23, { align: "center" });
    if (hospital?.phone) doc.text(`Ph: ${hospital.phone}`, 105, 28, { align: "center" });
    // Doctor right
    doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`Dr. ${doctor?.display_name ?? "—"}`, 196, 14, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(80);
    let dy = 19;
    if (doctor?.specialization) { doc.text(doctor.specialization, 196, dy, { align: "right" }); dy += 4; }
    if (doctor?.phone) { doc.text(`Ph: ${doctor.phone}`, 196, dy, { align: "right" }); dy += 4; }
    if (doctor?.license_no) { doc.text(`Reg #: ${doctor.license_no}`, 196, dy, { align: "right" }); dy += 4; }

    doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.8); doc.line(14, 36, 196, 36);

    // === Highlighted MRN row ===
    doc.setFillColor(254, 242, 242); doc.rect(14, 40, 182, 9, "F");
    doc.setTextColor(220, 38, 38); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`MRN: ${patient.mrn}`, 18, 46);
    if (patient.pmr_no) doc.text(`PMR: ${patient.pmr_no}`, 105, 46);
    doc.setTextColor(80); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Date: ${issuedDate.toLocaleString()}`, 192, 46, { align: "right" });

    // === PATIENT BLOCK ===
    let y = 56;
    doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Patient details", 14, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Name: ${patient.first_name} ${patient.last_name}`, 14, y);
    doc.text(`Father: ${patient.father_name ?? "—"}`, 110, y); y += 5;
    const ageStr = ageYears != null ? `${ageYears}y` : "—";
    doc.text(`Age: ${ageStr}`, 14, y);
    doc.text(`Sex: ${patient.sex ?? patient.gender ?? "—"}`, 60, y);
    doc.text(`Weight: ${patient.weight_kg ? `${patient.weight_kg} kg` : "—"}`, 110, y);
    if (patient.blood_group) doc.text(`Blood: ${patient.blood_group}`, 160, y);
    y += 5;
    if (patient.cnic) { doc.text(`CNIC: ${patient.cnic}`, 14, y); }
    if (patient.phone) { doc.text(`Phone: ${patient.phone}`, 110, y); }
    y += 8;
    doc.setDrawColor(220); doc.line(14, y - 3, 196, y - 3);

    // === CLINICAL FIELDS ===
    const writeRow = (label: string, value: string) => {
      if (!value) return;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(`${label}:`, 14, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(value, 160);
      doc.text(lines, 14 + doc.getTextWidth(`${label}: `), y);
      y += Math.max(6, lines.length * 5) + 2;
    };
    writeRow("Complaint", complaint);
    writeRow("Observations", observations);
    if (investigations) {
      doc.setFont("helvetica", "bold"); doc.text("Investigations Suggested:", 14, y); y += 6;
      doc.setFont("helvetica", "normal");
      investigations.split(/[,\n]/).map(s => s.trim()).filter(Boolean).forEach((it) => {
        doc.text(`• ${it}`, 18, y); y += 5;
      });
      y += 2;
    }
    writeRow("Diagnosis", diagnosis);

    // === Rx TABLE — Medicine · Dose · Frequency · Duration · Notes ===
    y += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("Rx", 14, y); y += 7;
    doc.setFontSize(10);
    doc.text("Medicine", 14, y); doc.text("Dose", 70, y); doc.text("Frequency", 100, y); doc.text("Duration", 135, y); doc.text("Notes", 165, y);
    doc.setDrawColor(200); doc.line(14, y + 1.5, 196, y + 1.5);
    doc.setFont("helvetica", "normal"); y += 7;
    meds.filter((m) => m.name.trim()).forEach((m) => {
      doc.text(m.name, 14, y);
      doc.text(m.dose || "—", 70, y);
      doc.text(m.frequency || "—", 100, y);
      doc.text(m.duration || "—", 135, y);
      const ins = doc.splitTextToSize(m.instructions || "—", 30);
      doc.text(ins, 165, y);
      y += Math.max(6, ins.length * 5);
      if (y > 250) { doc.addPage(); y = 20; }
    });

    if (notes) { y += 6; doc.setFont("helvetica","bold"); doc.text("Remarks:", 14, y);
      doc.setFont("helvetica","normal");
      const nl = doc.splitTextToSize(notes, 170); doc.text(nl, 14 + doc.getTextWidth("Remarks: "), y);
      y += nl.length * 5 + 2;
    }
    if (nextDate) { y += 4; doc.setFont("helvetica","bold"); doc.text("Next follow-up date:", 14, y);
      doc.setFont("helvetica","normal");
      doc.text(new Date(nextDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "2-digit", year: "numeric" }), 14 + doc.getTextWidth("Next follow-up date: "), y);
    }

    // === FOOTER: signature + generated date ===
    doc.setDrawColor(150); doc.line(140, 270, 196, 270);
    doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica","normal");
    doc.text("Authorised Signature", 168, 275, { align: "center" });
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.8); doc.line(14, 283, 196, 283);
    doc.setFontSize(9); doc.setTextColor(120); doc.setFont("helvetica","italic");
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 289);
    doc.text("This is a computer generated document", 196, 289, { align: "right" });
    return doc;
  }

  function doDownload() { buildPdf().save(`Prescription-${patient.mrn}-${Date.now()}.pdf`); }
  function doPrint() { const d = buildPdf(); d.autoPrint(); window.open(d.output("bloburl"), "_blank"); }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-primary" /> New prescription</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* LEFT: Form */}
          <div className="space-y-4">
            <div className="rounded-lg border bg-gradient-to-br from-primary/10 via-background to-background p-4">
              {ctxQ.isLoading ? (
                <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Doctor</p>
                    <p className="mt-1 text-sm font-semibold">Dr. {doctor?.display_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Stethoscope className="h-3 w-3" /> {doctor?.specialization ?? "General"}</p>
                    {doctor?.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {doctor.phone}</p>}
                  </div>
                  <div className="md:text-right">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Hospital</p>
                    <p className="mt-1 text-sm font-semibold flex items-center gap-1 md:justify-end"><Building2 className="h-3.5 w-3.5" /> {hospital?.name}</p>
                    <p className="text-xs text-muted-foreground">{patient.first_name} {patient.last_name} · {patient.mrn}</p>
                  </div>
                </div>
              )}
            </div>

            {!saved && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Complaint</Label><Input value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Full body pain…" /></div>
                  <div><Label>Observations</Label><Input value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="High temp, reddish eye…" /></div>
                </div>
                <div><Label>Investigations suggested (comma-separated)</Label><Input value={investigations} onChange={(e) => setInvestigations(e.target.value)} placeholder="CBC Count, Creatinine" /></div>
                <div><Label>Diagnosis</Label><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Dengue" /></div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label>Medications</Label>
                  </div>
                  <MedicineSearch items={pharmacyItems} loading={pharmQ.isLoading} onPick={(name) => addMed(name)} />
                  <div className="mt-3 space-y-3">
                    {meds.length === 0 && <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-md">Search and pick a medicine above to add it here.</p>}
                    {meds.map((m, i) => (
                      <div key={i} className="rounded-md border p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold">{i + 1}. {m.name || "Medicine"}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeMed(i)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Medicine name *" value={m.name} onChange={(e) => updateMed(i, { name: e.target.value })} />
                          <Input placeholder="Dose (e.g. 500mg)" value={m.dose} onChange={(e) => updateMed(i, { dose: e.target.value })} />
                          <Input placeholder="Dosage (e.g. 1-0-1)" value={m.frequency} onChange={(e) => updateMed(i, { frequency: e.target.value })} />
                          <Input placeholder="Duration (e.g. 5 days)" value={m.duration} onChange={(e) => updateMed(i, { duration: e.target.value })} />
                        </div>
                        <Input className="mt-2" placeholder="Instructions (e.g. After meal)" value={m.instructions} onChange={(e) => updateMed(i, { instructions: e.target.value })} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Next checkup date</Label><Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></div>
                  <div><Label>Remarks</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" /></div>
                </div>

                <Button className="w-full" disabled={saveMut.isPending || !meds.some((m) => m.name.trim())} onClick={() => saveMut.mutate()}>
                  {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pill className="mr-2 h-4 w-4" />}
                  Save & send to patient
                </Button>
              </>
            )}

            {saved && (
              <div className="space-y-3">
                <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm">
                  <p className="font-semibold">Prescription delivered</p>
                  <p className="text-xs text-muted-foreground">Patient notified and pharmacy can dispense by MRN / CNIC.</p>
                </div>
                <Button variant="ghost" className="w-full" onClick={onClose}>Close</Button>
              </div>
            )}
          </div>

          {/* RIGHT: Live preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live preview</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={doDownload}><Download className="mr-1 h-3.5 w-3.5" /> PDF</Button>
                <Button size="sm" variant="outline" onClick={doPrint}><Printer className="mr-1 h-3.5 w-3.5" /> Print</Button>
              </div>
            </div>
            <div className="rounded-lg border bg-white p-6 text-[12px] text-black shadow-sm" style={{ minHeight: 700 }}>
              {/* Header: logo · hospital · doctor */}
              <div className="flex items-start justify-between gap-3 border-b-2 border-red-600 pb-3">
                <div className="w-16 shrink-0">
                  {hospital?.logo_url && <img src={hospital.logo_url} alt="" className="h-14 w-14 object-contain" />}
                </div>
                <div className="flex-1 text-center">
                  <h2 className="text-lg font-bold">{hospital?.name ?? "Hospital"}</h2>
                  <p className="text-[10px] text-gray-600">{[hospital?.address, hospital?.city].filter(Boolean).join(", ")}</p>
                  {hospital?.phone && <p className="text-[10px] text-gray-600">Ph: {hospital.phone}</p>}
                </div>
                <div className="w-32 shrink-0 text-right">
                  <p className="text-[11px] font-bold">Dr. {doctor?.display_name ?? "—"}</p>
                  {doctor?.specialization && <p className="text-[10px] text-gray-600">{doctor.specialization}</p>}
                  {doctor?.phone && <p className="text-[10px] text-gray-600">Ph: {doctor.phone}</p>}
                  {doctor?.license_no && <p className="text-[10px] text-gray-600">Reg #: {doctor.license_no}</p>}
                </div>
              </div>
              {/* Highlighted MRN row */}
              <div className="mt-3 flex items-center justify-between rounded bg-red-50 px-3 py-1.5">
                <span className="text-[12px] font-bold text-red-600">MRN: {patient.mrn}</span>
                {patient.pmr_no && <span className="text-[11px] font-semibold text-red-600">PMR: {patient.pmr_no}</span>}
                <span className="text-[10px] text-gray-600">Date: {issuedDate.toLocaleString()}</span>
              </div>
              {/* Patient block */}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <p><span className="font-bold">Name:</span> {patient.first_name} {patient.last_name}</p>
                <p><span className="font-bold">Father:</span> {patient.father_name ?? "—"}</p>
                <p><span className="font-bold">Age:</span> {patient.dob ? `${new Date().getFullYear() - new Date(patient.dob).getFullYear()}y` : "—"}</p>
                <p><span className="font-bold">Sex:</span> {patient.sex ?? patient.gender ?? "—"}</p>
                <p><span className="font-bold">Weight:</span> {patient.weight_kg ? `${patient.weight_kg} kg` : "—"}</p>
                <p><span className="font-bold">Blood:</span> {patient.blood_group ?? "—"}</p>
                {patient.cnic && <p><span className="font-bold">CNIC:</span> {patient.cnic}</p>}
                {patient.phone && <p><span className="font-bold">Phone:</span> {patient.phone}</p>}
              </div>
              <div className="mt-4 space-y-2 text-[11px]">
                {complaint && <p><span className="font-bold">Complaint:</span> {complaint}</p>}
                {observations && <p><span className="font-bold">Observations:</span> {observations}</p>}
                {investigations && (
                  <div>
                    <p className="font-bold">Investigations Suggested:</p>
                    <ul className="ml-5 list-disc">
                      {investigations.split(/[,\n]/).map(s => s.trim()).filter(Boolean).map((it) => <li key={it}>{it}</li>)}
                    </ul>
                  </div>
                )}
                {diagnosis && <p><span className="font-bold">Diagnosis:</span> {diagnosis}</p>}
              </div>

              <div className="mt-5">
                <p className="text-base font-bold">Rx</p>
                <table className="mt-1 w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-300 text-left">
                      <th className="py-1 font-bold">Medicine</th>
                      <th className="py-1 font-bold">Dose</th>
                      <th className="py-1 font-bold">Frequency</th>
                      <th className="py-1 font-bold">Duration</th>
                      <th className="py-1 font-bold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meds.filter((m) => m.name.trim()).length === 0 ? (
                      <tr><td colSpan={5} className="py-3 text-center italic text-gray-400">Medicines will appear here…</td></tr>
                    ) : meds.filter((m) => m.name.trim()).map((m, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5">{m.name}</td>
                        <td className="py-1.5">{m.dose || "—"}</td>
                        <td className="py-1.5">{m.frequency || "—"}</td>
                        <td className="py-1.5">{m.duration || "—"}</td>
                        <td className="py-1.5">{m.instructions || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {notes && <p className="mt-4 text-[11px]"><span className="font-bold">Remarks:</span> {notes}</p>}
              {nextDate && <p className="mt-2 text-[11px]"><span className="font-bold">Next follow-up date:</span> {new Date(nextDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "2-digit", year: "numeric" })}</p>}

              <div className="mt-12 text-right">
                <div className="ml-auto w-48 border-t border-gray-400 pt-1 text-center text-[10px]">Authorised Signature</div>
              </div>
              <div className="mt-3 border-t-2 border-red-600 pt-1 text-center text-[10px] italic text-gray-500">
                This is a computer generated document
              </div>
            </div>
          </div>
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

/** Searchable typeahead for pharmacy items. */
function MedicineSearch({ items, loading, onPick }: { items: any[]; loading: boolean; onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items.slice(0, 8);
    return items.filter((it) => [it.name, it.sku, it.category, it.manufacturer].filter(Boolean).some((v: string) => v.toLowerCase().includes(t))).slice(0, 10);
  }, [items, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? "Loading pharmacy items…" : "Search medicine from pharmacy…"}
            className="pl-9"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : matches.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No matches.
              {q.trim() && (
                <Button size="sm" variant="ghost" className="ml-2" onClick={() => { onPick(q.trim()); setQ(""); setOpen(false); }}>
                  <Plus className="mr-1 h-3 w-3" /> Add "{q.trim()}"
                </Button>
              )}
            </div>
          ) : matches.map((it) => (
            <button key={it.id} onClick={() => { onPick(it.name); setQ(""); setOpen(false); }}
              className="flex w-full items-start justify-between gap-2 border-b px-3 py-2 text-left text-xs last:border-0 hover:bg-accent">
              <div>
                <p className="font-medium">{it.name}</p>
                <p className="text-[10px] text-muted-foreground">{[it.category, it.manufacturer, it.unit].filter(Boolean).join(" · ")}</p>
              </div>
              <Badge variant={it.stock_qty > it.reorder_level ? "outline" : "destructive"} className="shrink-0">Stock: {it.stock_qty}</Badge>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PatientForm({ slug, enabled, onSubmit, loading }: { slug: string; enabled: boolean; onSubmit: (d: any) => void; loading: boolean }) {
  const listDocs = useServerFn(listHospitalDoctors);
  const docsQ = useQuery({
    queryKey: ["hospital-doctors", slug],
    queryFn: () => listDocs({ data: { slug } }),
    enabled,
  });
  const doctors = docsQ.data?.doctors ?? [];
  const [v, setV] = useState({
    first_name: "", last_name: "", father_name: "",
    gender: "unknown" as "male"|"female"|"other"|"unknown",
    sex: "", weight_kg: "",
    dob: "", phone: "", email: "", blood_group: "", allergies: "", address: "",
    cnic: "", assigned_doctor_id: "",
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>First name *</Label><Input value={v.first_name} onChange={(e) => setV({ ...v, first_name: e.target.value })} /></div>
        <div><Label>Last name *</Label><Input value={v.last_name} onChange={(e) => setV({ ...v, last_name: e.target.value })} /></div>
      </div>
      <div><Label>Father name</Label><Input value={v.father_name} onChange={(e) => setV({ ...v, father_name: e.target.value })} placeholder="Father's full name" /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Sex</Label>
          <Select value={v.sex || v.gender} onValueChange={(g) => setV({ ...v, sex: g, gender: g as any })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem><SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Date of birth</Label><Input type="date" value={v.dob} onChange={(e) => setV({ ...v, dob: e.target.value })} /></div>
        <div><Label>Weight (kg)</Label><Input type="number" step="0.1" value={v.weight_kg} onChange={(e) => setV({ ...v, weight_kg: e.target.value })} placeholder="e.g. 70" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>CNIC</Label><Input value={v.cnic} onChange={(e) => setV({ ...v, cnic: e.target.value })} placeholder="35202-1234567-1" /></div>
        <div><Label>Phone</Label><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="+92 …" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Blood group</Label><Input value={v.blood_group} onChange={(e) => setV({ ...v, blood_group: e.target.value })} placeholder="A+, O-, …" /></div>
        <div><Label>Email</Label><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
      </div>
      <div>
        <Label>Assign doctor (optional)</Label>
        <Select value={v.assigned_doctor_id || "none"} onValueChange={(g) => setV({ ...v, assigned_doctor_id: g === "none" ? "" : g })}>
          <SelectTrigger><SelectValue placeholder={doctors.length ? "Select doctor" : "No doctors yet"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— No doctor —</SelectItem>
            {doctors.map((d: any) => (
              <SelectItem key={d.user_id} value={d.user_id}>
                {d.display_name ?? "Doctor"}{d.specialization ? ` · ${d.specialization}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">If a doctor is selected, an appointment for today is created automatically and the doctor is notified.</p>
      </div>
      <div><Label>Allergies (comma-separated)</Label><Input value={v.allergies} onChange={(e) => setV({ ...v, allergies: e.target.value })} placeholder="Penicillin, Latex" /></div>
      <div><Label>Address</Label><Textarea rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></div>
      <Button className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95"
        disabled={loading || !v.first_name || !v.last_name}
        onClick={() => onSubmit(v)}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
        Register patient
      </Button>
    </div>
  );
}
