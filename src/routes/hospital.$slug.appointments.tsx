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
import { listAppointments, createAppointment, updateAppointmentStatus, deleteAppointment, updateAppointmentPayment, listPaymentHistory } from "@/lib/appointments.functions";
import { listPatients } from "@/lib/patients.functions";
import { Loader2, Trash2, CalendarPlus, Database, BadgeCheck, History, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { downloadPaymentReceipt } from "@/lib/payment-receipt";
import { buildReceiptArgsFromRow } from "@/lib/receipt-builder";
import { ConcessionRequestsPanel } from "@/components/concession-controls";
import { listConcessionRequests } from "@/lib/concession.functions";
import { Percent } from "lucide-react";

export const Route = createFileRoute("/hospital/$slug/appointments")({
  head: () => ({ meta: [{ title: "Appointments — MediFlow AI" }] }),
  component: AppointmentsPage,
});

const STATUS_TONE: Record<string, "ok" | "info" | "warn" | "danger" | "muted"> = {
  scheduled: "muted", checked_in: "info", in_progress: "ok",
  completed: "ok", cancelled: "danger", no_show: "warn",
};

function AppointmentsPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const list = useServerFn(listAppointments);
  const listPts = useServerFn(listPatients);
  const create = useServerFn(createAppointment);
  const upd = useServerFn(updateAppointmentStatus);
  const del = useServerFn(deleteAppointment);
  const updPay = useServerFn(updateAppointmentPayment);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ["appointments", slug],
    queryFn: () => list({ data: { slug } }),
    enabled: !!user,
  });
  const pq = useQuery({
    queryKey: ["patients-min", slug],
    queryFn: () => listPts({ data: { slug } }),
    enabled: !!user,
  });
  const listConcessions = useServerFn(listConcessionRequests);
  const cq = useQuery({
    queryKey: ["concessions-all", slug],
    queryFn: () => listConcessions({ data: { slug, status: "all" } }),
    enabled: !!user,
  });
  const concessionByAppt: Record<string, any> = {};
  for (const r of cq.data?.requests ?? []) {
    const prev = concessionByAppt[r.appointment_id];
    if (!prev || r.status === "pending") concessionByAppt[r.appointment_id] = r;
  }

  // Realtime: refresh on any appointment/payment change for this hospital
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("appts-" + slug)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" },
        () => qc.invalidateQueries({ queryKey: ["appointments", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => qc.invalidateQueries({ queryKey: ["appointments", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "concession_requests" },
        () => qc.invalidateQueries({ queryKey: ["concessions-all", slug] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, slug, qc]);

  const createMut = useMutation({
    mutationFn: (data: any) => create({ data }),
    onSuccess: () => { toast.success("Appointment booked"); setOpen(false); qc.invalidateQueries({ queryKey: ["appointments", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const updMut = useMutation({
    mutationFn: (v: { id: string; status: any }) => upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", slug] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["appointments", slug] }); },
  });
  const payMut = useMutation({
    mutationFn: (v: { appointment_id: string; payment_status: any; row?: any; method?: string }) =>
      updPay({ data: { appointment_id: v.appointment_id, payment_status: v.payment_status, method: v.method as any } }),
    onSuccess: (_r, v) => {
      toast.success("Payment status updated");
      qc.invalidateQueries({ queryKey: ["appointments", slug] });
      // Auto-generate + auto-print receipt on paid
      if (v.payment_status === "paid" && v.row) {
        const r = v.row;
        const h = q.data?.hospital;
        void downloadPaymentReceipt(buildReceiptArgsFromRow(r, h, { autoPrint: true, methodOverride: v.method }));
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const allRows = q.data?.appointments ?? [];
  const localDateKey = (input: string | Date) => {
    const d = new Date(input);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const todayIso = localDateKey(new Date());
  const [filterDate, setFilterDate] = useState<string>(todayIso);
  const rows = allRows.filter((r: any) => {
    if (!filterDate) return true;
    return localDateKey(r.scheduled_at) === filterDate;
  });
  const todays = allRows.filter((r: any) => localDateKey(r.scheduled_at) === todayIso);

  return (
    <ModulePage title="Appointments" subtitle="Live data · Lovable Cloud" actions={
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><div><NewBtn label="Book appointment" /></div></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Book appointment</DialogTitle></DialogHeader>
          <BookingForm
            patients={pq.data?.patients ?? []}
            loading={createMut.isPending}
            onSubmit={(d) => createMut.mutate({ slug, ...d })}
          />
          <DialogFooter />
        </DialogContent>
      </Dialog>
    }>
      {!user && <SignInBanner />}

      <ConcessionRequestsPanel slug={slug} />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Filter by date</Label>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="h-9 w-44" />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setFilterDate(todayIso)}>Today</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setFilterDate("")}>All</Button>
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{rows.length}</span> of {allRows.length}
          {filterDate && <> · {new Date(filterDate).toLocaleDateString()}</>}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Today" value={String(todays.length)} />
        <StatCard label="Checked in" value={String(rows.filter((r: any) => r.status === "checked_in").length)} tone="info" />
        <StatCard label="In consult" value={String(rows.filter((r: any) => r.status === "in_progress").length)} tone="success" />
        <StatCard label="Filtered total" value={String(rows.length)} />
      </div>

      <Card className="p-0">
        {q.isLoading && <Loading />}
        {q.error && <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>}
        {q.data && rows.length === 0 && (
          <div className="flex flex-col items-center p-12 text-center">
            <CalendarPlus className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No appointments for selected date</p>
            <p className="text-xs text-muted-foreground">Try a different date or clear the filter.</p>
          </div>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr></thead>
              <tbody>{rows.map((r: any) => {
                const fee = Number(r.consultation_fee || r.payment?.amount || 0);
                const payStatus = r.payment_status || "unpaid";
                const payTone =
                  payStatus === "paid" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                  : payStatus === "pending" ? "bg-yellow-500/15 text-yellow-700 border-yellow-500/30"
                  : payStatus === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
                  : payStatus === "refunded" ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
                  : "bg-muted text-muted-foreground border-border";
                return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-3 font-mono text-xs">{new Date(r.scheduled_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : "—"}
                    {r.patient?.mrn && <div className="text-[10px] text-muted-foreground">MRN {r.patient.mrn}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.doctor ? <>Dr {r.doctor.display_name}<div className="text-[10px] text-muted-foreground">{r.doctor.specialization ?? ""}</div></> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{r.type}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-xs">{fee > 0 ? `Rs ${fee.toLocaleString()}` : "—"}</span>
                      {(() => {
                        const cr = concessionByAppt[r.id];
                        const applied = Number(r.concession_amount || 0);
                        if (applied > 0) {
                          return (
                            <span className="inline-flex w-fit items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              <Percent className="h-2.5 w-2.5" /> Concession Rs {applied.toLocaleString()} applied
                              {fee > 0 && <span className="text-emerald-700/70"> · Payable Rs {Math.max(0, fee - applied).toLocaleString()}</span>}
                            </span>
                          );
                        }
                        if (cr && cr.status === "pending") {
                          return (
                            <span className="inline-flex w-fit items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              <Percent className="h-2.5 w-2.5" /> Dr {cr.doctor_name}: Rs {Number(cr.amount).toLocaleString()} pending
                            </span>
                          );
                        }
                        if (cr && cr.status === "rejected") {
                          return (
                            <span className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              <Percent className="h-2.5 w-2.5" /> Concession rejected
                            </span>
                          );
                        }
                        return null;
                      })()}
                      <span className="text-[10px] capitalize text-muted-foreground">{r.payment?.method || "—"}{r.payment?.txn_id ? ` · ${r.payment.txn_id}` : ""}</span>
                      <Select value={payStatus} onValueChange={(s) => payMut.mutate({ appointment_id: r.id, payment_status: s as any, row: r })}>
                        <SelectTrigger className={`h-7 w-32 rounded-md border px-2 text-[11px] capitalize ${payTone}`}>{payStatus}</SelectTrigger>
                        <SelectContent>
                          {["paid","pending","failed","refunded","unpaid"].map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1 pt-0.5">
                        {payStatus !== "paid" && (r.payment?.method === "cash" || !r.payment?.method) && (
                          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]"
                            onClick={() => payMut.mutate({ appointment_id: r.id, payment_status: "paid", row: r, method: "cash" })}>
                            <BadgeCheck className="h-3 w-3" /> Cash received
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px]"
                          onClick={() => setHistoryFor(r)}>
                          <History className="h-3 w-3" /> History
                        </Button>
                        {payStatus === "paid" && (
                          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px]"
                            onClick={() => {
                              const h = q.data?.hospital;
                              void downloadPaymentReceipt(buildReceiptArgsFromRow(r, h));
                            }}>
                            <Download className="h-3 w-3" /> Receipt
                          </Button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] capitalize text-muted-foreground">
                    {r.booking_source === "patient_portal" ? "Patient portal" : "Receptionist"}
                  </td>
                  <td className="px-4 py-3">
                    <Select value={r.status} onValueChange={(s) => updMut.mutate({ id: r.id, status: s })}>
                      <SelectTrigger className="h-8 w-36"><StatusBadge status={r.status.replace("_", " ")} tone={STATUS_TONE[r.status] ?? "muted"} /></SelectTrigger>
                      <SelectContent>
                        {["scheduled","checked_in","in_progress","completed","cancelled","no_show"].map((s) => (
                          <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => delMut.mutate(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </td>
                </tr>);
              })}</tbody>
            </table>
          </div>
        )}
      </Card>

      <PaymentHistoryDialog row={historyFor} onClose={() => setHistoryFor(null)} />
    </ModulePage>
  );
}

function PaymentHistoryDialog({ row, onClose }: { row: any | null; onClose: () => void }) {
  const list = useServerFn(listPaymentHistory);
  const q = useQuery({
    queryKey: ["pay-history", row?.id],
    queryFn: () => list({ data: { appointment_id: row.id } }),
    enabled: !!row,
  });
  const history = q.data?.history ?? [];
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Payment history</DialogTitle></DialogHeader>
        {q.isLoading && <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
        {!q.isLoading && history.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No payment records yet.</p>}
        {history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Date</th><th>Method</th><th>Amount</th><th>Status</th><th>Reference</th><th>Txn ID</th><th>Updated by</th>
              </tr></thead>
              <tbody>{history.map((h: any) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="py-2 font-mono">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="capitalize">{h.method}</td>
                  <td>Rs {Number(h.amount).toLocaleString()}</td>
                  <td className="capitalize">{h.status}</td>
                  <td className="text-muted-foreground">{h.reference_no || "—"}</td>
                  <td className="text-muted-foreground">{h.txn_id || "—"}</td>
                  <td className="text-muted-foreground">{h.updated_by_name || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

function BookingForm({ patients, onSubmit, loading }: { patients: any[]; onSubmit: (d: any) => void; loading: boolean }) {
  const [mode, setMode] = useState<"existing" | "new">(patients.length ? "existing" : "new");
  const [v, setV] = useState({
    patient_id: "",
    scheduled_at: new Date(Date.now() + 3600_000).toISOString().slice(0, 16),
    duration_min: 30,
    type: "consultation" as const,
    reason: "",
  });
  const [np, setNp] = useState({
    first_name: "", last_name: "", phone: "", cnic: "",
    gender: "unknown" as "male" | "female" | "other" | "unknown",
    dob: "",
  });
  const [pay, setPay] = useState({
    enabled: false,
    method: "cash" as "cash" | "online" | "jazzcash" | "easypaisa" | "bank_transfer" | "card",
    amount: 0,
    txn_id: "",
    payer_name: "",
  });

  const canSubmit =
    !!v.scheduled_at &&
    (mode === "existing" ? !!v.patient_id : !!np.first_name && !!np.last_name);

  const submit = () => {
    const payload: any = {
      ...v,
      scheduled_at: new Date(v.scheduled_at).toISOString(),
    };
    if (mode === "existing") payload.patient_id = v.patient_id;
    else payload.new_patient = { ...np, dob: np.dob || null };
    if (pay.enabled && pay.amount > 0) {
      payload.payment = {
        method: pay.method,
        amount: pay.amount,
        txn_id: pay.txn_id || null,
        payer_name: pay.payer_name || null,
      };
      payload.consultation_fee = pay.amount;
    }
    onSubmit(payload);
  };

  return (
    <div className="space-y-3">
      <div className="flex rounded-md border p-0.5 text-xs">
        <button type="button"
          className={`flex-1 rounded px-3 py-1.5 font-medium transition ${mode === "existing" ? "bg-secondary" : "text-muted-foreground"}`}
          onClick={() => setMode("existing")}>Existing patient</button>
        <button type="button"
          className={`flex-1 rounded px-3 py-1.5 font-medium transition ${mode === "new" ? "bg-secondary" : "text-muted-foreground"}`}
          onClick={() => setMode("new")}>+ Register new</button>
      </div>

      {mode === "existing" ? (
        <div><Label>Patient *</Label>
          <Select value={v.patient_id} onValueChange={(p) => setV({ ...v, patient_id: p })}>
            <SelectTrigger><SelectValue placeholder={patients.length ? "Select patient" : "No patients — switch to Register new"} /></SelectTrigger>
            <SelectContent>{patients.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name} · {p.mrn}</SelectItem>
            ))}</SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs font-semibold text-muted-foreground">Patient details</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">First name *</Label><Input value={np.first_name} onChange={(e) => setNp({ ...np, first_name: e.target.value })} /></div>
            <div><Label className="text-xs">Last name *</Label><Input value={np.last_name} onChange={(e) => setNp({ ...np, last_name: e.target.value })} /></div>
            <div><Label className="text-xs">Phone</Label><Input value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} /></div>
            <div><Label className="text-xs">CNIC</Label><Input value={np.cnic} onChange={(e) => setNp({ ...np, cnic: e.target.value })} placeholder="13 digits" /></div>
            <div><Label className="text-xs">Gender</Label>
              <Select value={np.gender} onValueChange={(g) => setNp({ ...np, gender: g as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["male","female","other","unknown"].map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Date of birth</Label><Input type="date" value={np.dob} onChange={(e) => setNp({ ...np, dob: e.target.value })} /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">A new MRN will be auto-generated. If the CNIC already exists, the existing patient is reused.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div><Label>When *</Label><Input type="datetime-local" value={v.scheduled_at} onChange={(e) => setV({ ...v, scheduled_at: e.target.value })} /></div>
        <div><Label>Duration (min)</Label><Input type="number" min={5} max={480} value={v.duration_min} onChange={(e) => setV({ ...v, duration_min: Number(e.target.value) })} /></div>
      </div>
      <div><Label>Type</Label>
        <Select value={v.type} onValueChange={(t) => setV({ ...v, type: t as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["consultation","followup","procedure","emergency","telemedicine"].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Reason</Label><Textarea rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></div>

      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={pay.enabled} onChange={(e) => setPay({ ...pay, enabled: e.target.checked })} />
          Collect payment now
        </label>
        {pay.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Method</Label>
              <Select value={pay.method} onValueChange={(m) => setPay({ ...pay, method: m as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="jazzcash">JazzCash</SelectItem>
                  <SelectItem value="easypaisa">Easypaisa</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Amount (Rs)</Label><Input type="number" min={0} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })} /></div>
            {pay.method !== "cash" && (
              <>
                <div className="col-span-2"><Label className="text-xs">Transaction ID</Label><Input value={pay.txn_id} onChange={(e) => setPay({ ...pay, txn_id: e.target.value })} placeholder="From the gateway / receipt" /></div>
                <div className="col-span-2"><Label className="text-xs">Payer name</Label><Input value={pay.payer_name} onChange={(e) => setPay({ ...pay, payer_name: e.target.value })} /></div>
              </>
            )}
            <p className="col-span-2 text-[11px] text-muted-foreground">
              Cash payments are marked paid immediately. Online/bank transfers are recorded as pending verification.
            </p>
          </div>
        )}
      </div>

      <Button className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95"
        disabled={loading || !canSubmit}
        onClick={submit}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} Book appointment
      </Button>
    </div>
  );
}

function SignInBanner() {
  return (
    <Card className="flex items-center justify-between border-warning/30 bg-warning/10 p-4">
      <div className="flex items-center gap-3">
        <Database className="h-5 w-5 text-warning-foreground" />
        <div><p className="text-sm font-semibold">Sign in to access this module</p>
          <p className="text-xs text-muted-foreground">Data is RLS-protected to your hospital workspace.</p></div>
      </div>
      <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
    </Card>
  );
}
function Loading() {
  return <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;
}
