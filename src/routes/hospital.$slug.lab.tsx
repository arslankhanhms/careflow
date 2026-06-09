import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ModulePage, NewBtn, StatCard, StatusBadge } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLabOrders, createLabOrder, updateLabOrderStatus, submitLabResults, getLabOrderForPdf } from "@/lib/lab.functions";
import { listLabServices } from "@/lib/lab-services.functions";
import { listPatients, listHospitalDoctors } from "@/lib/patients.functions";
import { Loader2, FlaskConical, Database, ClipboardCheck, Plus, Trash2, FileDown, Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { downloadLabReportPdf } from "@/lib/lab-pdf";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/hospital/$slug/lab")({
  head: () => ({ meta: [{ title: "Lab — MediFlow AI" }] }),
  component: LabPage,
});

const STATUS_TONE: Record<string, "ok" | "info" | "warn" | "danger" | "muted"> = {
  ordered: "muted", sample_collected: "info", processing: "info",
  completed: "ok", cancelled: "danger",
};

function LabPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const list = useServerFn(listLabOrders);
  const listPts = useServerFn(listPatients);
  const listDocs = useServerFn(listHospitalDoctors);
  const listSvc = useServerFn(listLabServices);
  const create = useServerFn(createLabOrder);
  const upd = useServerFn(updateLabOrderStatus);
  const submitRes = useServerFn(submitLabResults);
  const fetchPdf = useServerFn(getLabOrderForPdf);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [resultsOrder, setResultsOrder] = useState<any | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (orderId: string, mode: "save" | "print" = "save") => {
    try {
      setDownloadingId(orderId);
      const res = await fetchPdf({ data: { orderId } });
      downloadLabReportPdf(res.order as any, res.hospitalName, mode);
    } catch (e: any) {
      toast.error(e?.message || "Failed to build PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  const q = useQuery({
    queryKey: ["lab", slug],
    queryFn: () => list({ data: { slug } }),
    enabled: !!user,
  });
  const pq = useQuery({
    queryKey: ["patients-min", slug],
    queryFn: () => listPts({ data: { slug } }),
    enabled: !!user && open,
  });
  const svcQ = useQuery({
    queryKey: ["lab-services", slug],
    queryFn: () => listSvc({ data: { slug } }),
    enabled: !!user && open,
  });
  const docQ = useQuery({
    queryKey: ["hospital-doctors", slug],
    queryFn: () => listDocs({ data: { slug } }),
    enabled: !!user && open,
  });

  const createMut = useMutation({
    mutationFn: (d: any) => create({ data: d }),
    onSuccess: () => { toast.success("Lab order created"); setOpen(false); qc.invalidateQueries({ queryKey: ["lab", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const updMut = useMutation({
    mutationFn: (v: { id: string; status: any }) => upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lab", slug] }),
  });
  const resMut = useMutation({
    mutationFn: (v: any) => submitRes({ data: v }),
    onSuccess: () => {
      toast.success("Results sent to doctor & patient");
      setResultsOrder(null);
      qc.invalidateQueries({ queryKey: ["lab", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = q.data?.orders ?? [];
  const hospitalId = rows[0]?.hospital_id as string | undefined;

  // Realtime: only surface orders the lab actually needs to act on, i.e. paid.
  // New (unpaid) orders sit with the receptionist until fee is collected.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`lab-orders-${slug}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lab_orders" }, (payload: any) => {
        const row = payload.new;
        if (hospitalId && row.hospital_id !== hospitalId) return;
        if (row.payment_status !== "paid") return;
        const urgent = row.priority === "urgent" || row.priority === "stat";
        toast[urgent ? "warning" : "info"](
          urgent ? "🚨 PAID & URGENT lab request — start now" : "✅ New paid lab request — ready to process",
          { description: `Priority: ${row.priority ?? "routine"}`, duration: 10000 },
        );
        qc.invalidateQueries({ queryKey: ["lab", slug] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lab_orders" }, (payload: any) => {
        const row = payload.new;
        const prev = payload.old;
        if (hospitalId && row.hospital_id !== hospitalId) return;
        // Big popup when receptionist marks the bill paid
        if (row.payment_status === "paid" && prev?.payment_status !== "paid") {
          const urgent = row.priority === "urgent" || row.priority === "stat";
          toast.success(
            urgent
              ? "🚨 PAYMENT RECEIVED — Urgent lab order ready to process"
              : "✅ Payment received — lab order ready to process",
            {
              description: `Tests: ${(row.tests ?? []).join(", ") || "—"} · Priority: ${row.priority ?? "routine"}`,
              duration: 12000,
            },
          );
        }
        qc.invalidateQueries({ queryKey: ["lab", slug] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, slug, hospitalId, qc]);


  return (
    <ModulePage title="Laboratory" subtitle="Live data · Lovable Cloud · AI interpretation in AI Assistants" actions={
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><div><NewBtn label="New order" /></div></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>New lab order</DialogTitle></DialogHeader>
          <OrderForm
            patients={pq.data?.patients ?? []}
            services={(svcQ.data ?? []).filter((s: any) => s.enabled)}
            doctors={docQ.data?.doctors ?? []}
            loading={createMut.isPending}
            onSubmit={(d) => createMut.mutate({ slug, ...d })}
          />
          <DialogFooter />
        </DialogContent>
      </Dialog>
    }>
      {!user && <SignInBanner />}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Ordered" value={String(rows.filter((r:any)=>r.status==="ordered").length)} />
        <StatCard label="Processing" value={String(rows.filter((r:any)=>r.status==="processing").length)} tone="info" />
        <StatCard label="Completed" value={String(rows.filter((r:any)=>r.status==="completed").length)} tone="success" />
        <StatCard label="STAT" value={String(rows.filter((r:any)=>r.priority==="stat").length)} tone="destructive" />
      </div>

      <Card className="p-0">
        {q.isLoading && <Loading />}
        {q.error && <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>}
        {q.data && rows.length === 0 && (
          <div className="flex flex-col items-center p-12 text-center">
            <FlaskConical className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No lab orders yet</p>
          </div>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Order</th><th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Tests</th><th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Ordered</th><th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Results</th>
              </tr></thead>
              <tbody>{rows.map((r:any) => {
                const isUrgent = r.priority === "urgent" || r.priority === "stat";
                return (<tr key={r.id} className={`border-b last:border-0 ${isUrgent ? "bg-destructive/10 hover:bg-destructive/15" : "hover:bg-secondary/40"}`}>
                  <td className="px-4 py-3 font-mono text-xs">
                    {isUrgent && <AlertTriangle className="mr-1 inline h-3 w-3 text-destructive" />}
                    {r.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-medium">{r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : "—"}</td>
                  <td className="px-4 py-3 text-xs">{(r.tests ?? []).join(", ")}</td>
                  <td className="px-4 py-3 text-xs">{r.doctor?.display_name ?? "—"}{r.doctor?.specialization ? ` · ${r.doctor.specialization}` : ""}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.priority} tone={r.priority==="stat"?"danger":r.priority==="urgent"?"warn":"muted"} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Select value={r.status} onValueChange={(s) => updMut.mutate({ id: r.id, status: s })}>
                      <SelectTrigger className="h-8 w-40"><StatusBadge status={r.status.replace("_"," ")} tone={STATUS_TONE[r.status] ?? "muted"} /></SelectTrigger>
                      <SelectContent>
                        {["ordered","sample_collected","processing","completed","cancelled"].map((s) => (
                          <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => setResultsOrder(r)} disabled={r.status === "cancelled"}>
                        <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
                        {r.results_count > 0 ? `Add (${r.results_count})` : "Enter"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDownload(r.id)} disabled={downloadingId === r.id} title="Download PDF">
                        {downloadingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDownload(r.id, "print")} disabled={downloadingId === r.id} title="Print">
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>);
              })}</tbody>
            </table>
          </div>
        )}
      </Card>

      {resultsOrder && (
        <ResultsDialog
          order={resultsOrder}
          onClose={() => setResultsOrder(null)}
          onSubmit={(v) => resMut.mutate({ orderId: resultsOrder.id, results: v })}
          saving={resMut.isPending}
        />
      )}
    </ModulePage>
  );
}

function ResultsDialog({ order, onClose, onSubmit, saving }: { order: any; onClose: () => void; onSubmit: (v: any[]) => void; saving: boolean }) {
  const initial = (order.tests ?? []).map((t: string) => ({ test_name: t, value: "", unit: "", reference_range: "", flag: "" }));
  const [rows, setRows] = useState<any[]>(initial.length ? initial : [{ test_name: "", value: "", unit: "", reference_range: "", flag: "" }]);
  const upd = (i: number, k: string, v: string) => setRows((m) => m.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const add = () => setRows((m) => [...m, { test_name: "", value: "", unit: "", reference_range: "", flag: "" }]);
  const rm = (i: number) => setRows((m) => m.filter((_, idx) => idx !== i));
  const valid = rows.filter((r) => r.test_name.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Enter lab results · {order.patient?.first_name} {order.patient?.last_name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Ordered by {order.doctor?.display_name ?? "—"}. Results will be sent to the doctor and patient.</p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-md border p-2">
              <div className="grid gap-2 md:grid-cols-2">
                <Input value={r.test_name} onChange={(e) => upd(i, "test_name", e.target.value)} placeholder="Test name" />
                <Input value={r.value} onChange={(e) => upd(i, "value", e.target.value)} placeholder="Value" />
                <Input value={r.unit} onChange={(e) => upd(i, "unit", e.target.value)} placeholder="Unit (mg/dL)" />
                <Input value={r.reference_range} onChange={(e) => upd(i, "reference_range", e.target.value)} placeholder="Reference range" />
              </div>
              <div className="mt-2 flex gap-2">
                <Input value={r.flag} onChange={(e) => upd(i, "flag", e.target.value)} placeholder="Flag (H / L / normal)" />
                {rows.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => rm(i)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" /> Add row</Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || valid.length === 0} onClick={() => onSubmit(valid)}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />} Submit results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderForm({ patients, services, doctors, onSubmit, loading }: { patients: any[]; services: any[]; doctors: any[]; onSubmit: (d: any) => void; loading: boolean }) {
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [commission, setCommission] = useState<number>(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [notes, setNotes] = useState("");

  const grouped = services.reduce((acc: Record<string, any[]>, s) => {
    const k = s.category || "Other";
    (acc[k] = acc[k] || []).push(s);
    return acc;
  }, {});
  const toggle = (name: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const tests = Array.from(selected);

  return (
    <div className="space-y-3">
      <div><Label>Patient *</Label>
        <Select value={patientId} onValueChange={setPatientId}>
          <SelectTrigger><SelectValue placeholder={patients.length ? "Select patient" : "No patients yet"} /></SelectTrigger>
          <SelectContent>{patients.map((p) => (<SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name} · {p.mrn}</SelectItem>))}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>Referring doctor</Label>
          <Select value={doctorId} onValueChange={setDoctorId}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {doctors.map((d) => (
                <SelectItem key={d.user_id} value={d.user_id}>{d.display_name}{d.specialization ? ` · ${d.specialization}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Doctor commission %</Label>
          <Input type="number" step="0.1" min={0} max={100} value={commission}
            onChange={(e) => setCommission(Number(e.target.value))}
            placeholder="e.g. 20" />
        </div>
      </div>
      <div>
        <Label>Tests * <span className="text-xs text-muted-foreground">({tests.length} selected)</span></Label>
        <div className="mt-1 max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
          {services.length === 0 && (
            <p className="text-xs text-muted-foreground">No enabled services. Ask your admin to enable lab services from the Admin → Lab Services page.</p>
          )}
          {Object.entries(grouped).map(([cat, items]: any) => (
            <div key={cat}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.name)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${selected.has(s.name) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary/50"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div><Label>Priority</Label>
        <Select value={priority} onValueChange={(p) => setPriority(p as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="routine">Routine</SelectItem><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="stat">STAT</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95"
        disabled={loading || !patientId || tests.length === 0}
        onClick={() => onSubmit({
          patient_id: patientId,
          tests,
          priority,
          notes,
          referring_doctor_id: doctorId && doctorId !== "__none__" ? doctorId : undefined,
          doctor_commission_percent: doctorId && doctorId !== "__none__" ? Number(commission || 0) : undefined,
        })}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />} Create order
      </Button>
    </div>
  );
}

function SignInBanner() {
  return (
    <Card className="flex items-center justify-between border-warning/30 bg-warning/10 p-4">
      <div className="flex items-center gap-3">
        <Database className="h-5 w-5 text-warning-foreground" />
        <div><p className="text-sm font-semibold">Sign in required</p>
          <p className="text-xs text-muted-foreground">Lab data is tenant-scoped.</p></div>
      </div>
      <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
    </Card>
  );
}
function Loading() {
  return <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;
}
