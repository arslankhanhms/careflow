import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  requestCollectionClosure, listCollectionClosures, approveCollectionClosure,
  listClosureDoctors,
} from "@/lib/closures.functions";
import { CheckCircle2, XCircle, Clock, FileSignature } from "lucide-react";

export const Route = createFileRoute("/hospital/$slug/closures")({
  component: ClosuresPage,
});

function fmt(n: any) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function ClosuresPage() {
  const { slug } = useParams({ from: "/hospital/$slug/closures" });
  const qc = useQueryClient();
  const listFn = useServerFn(listCollectionClosures);
  const reqFn = useServerFn(requestCollectionClosure);
  const apprFn = useServerFn(approveCollectionClosure);
  const docsFn = useServerFn(listClosureDoctors);

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [scope, setScope] = useState<"opd" | "all">("opd");
  const [doctorId, setDoctorId] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["closures", slug],
    queryFn: () => listFn({ data: { slug } }),
  });

  const doctorsQ = useQuery({
    queryKey: ["closure-doctors", slug],
    queryFn: () => docsFn({ data: { slug } }),
  });
  const doctors = doctorsQ.data?.doctors ?? [];

  useEffect(() => {
    const ch = supabase.channel(`closures-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "collection_closures" },
        () => qc.invalidateQueries({ queryKey: ["closures", slug] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [slug, qc]);

  useEffect(() => { if (doctorId !== "all" && scope !== "opd") setScope("opd"); }, [doctorId, scope]);


  const requestM = useMutation({
    mutationFn: () => reqFn({ data: {
      slug, date, scope,
      doctorUserId: doctorId !== "all" ? doctorId : undefined,
      notes: notes || undefined,
    } }),
    onSuccess: () => { toast.success("Closure requested"); setNotes(""); qc.invalidateQueries({ queryKey: ["closures", slug] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const decide = useMutation({
    mutationFn: (v: { closureId: string; decision: "approved" | "disputed"; reason?: string }) =>
      apprFn({ data: { slug, ...v } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["closures", slug] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const rows = data?.closures || [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Daily Collection Closure</h1>
        <p className="text-sm text-muted-foreground">End-of-day collection summaries, signed off by doctors and admins.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileSignature className="h-4 w-4" /> Request closure</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Doctor (OPD)</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger><SelectValue placeholder="All doctors" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All doctors</SelectItem>
                {doctors.map((d: any) => (
                  <SelectItem key={d.user_id} value={d.user_id}>
                    {d.name}{d.specialization ? ` · ${d.specialization}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "opd" | "all")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="opd">OPD only</SelectItem>
                <SelectItem value="all" disabled={doctorId !== "all"}>OPD + Lab + Pharmacy</SelectItem>
              </SelectContent>
            </Select>
            {doctorId !== "all" && (
              <p className="mt-1 text-[11px] text-muted-foreground">Lab & Pharmacy aren't tied to a doctor — pick "All doctors" to include them.</p>
            )}
          </div>
          <div className="md:col-span-4">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any cash variances, pending entries…" rows={2} />
          </div>
          <div className="md:col-span-4">
            <Button onClick={() => requestM.mutate()} disabled={requestM.isPending}>
              {requestM.isPending ? "Submitting…" : "Submit for approval"}
            </Button>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle>Closure history</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            rows.length === 0 ? <p className="text-sm text-muted-foreground">No closures yet.</p> :
              <div className="space-y-3">
                {rows.map((r: any) => (
                  <div key={r.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{r.closure_date}</span>
                          <Badge variant={r.status === "approved" ? "default" : r.status === "disputed" ? "destructive" : "secondary"}>
                            {r.status === "approved" ? <CheckCircle2 className="mr-1 h-3 w-3" /> :
                              r.status === "disputed" ? <XCircle className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                            {r.status}
                          </Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
                          <Stat label="OPD" v={fmt(r.opd_total)} />
                          <Stat label="Lab" v={fmt(r.lab_total)} />
                          <Stat label="Pharmacy" v={fmt(r.pharmacy_total)} />
                          <Stat label="Cash" v={fmt(r.cash_total)} />
                          <Stat label="Online" v={fmt(r.online_total)} />
                          <Stat label="Total" v={fmt(r.grand_total)} bold />
                        </div>
                        {r.notes && <p className="mt-2 text-xs text-muted-foreground">Notes: {r.notes}</p>}
                        {r.dispute_reason && <p className="mt-1 text-xs text-destructive">Dispute: {r.dispute_reason}</p>}
                      </div>
                      {r.status === "pending" && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => decide.mutate({ closureId: r.id, decision: "approved" })}>Approve</Button>
                          <Button size="sm" variant="destructive"
                            onClick={() => {
                              const reason = prompt("Dispute reason?");
                              if (reason) decide.mutate({ closureId: r.id, decision: "disputed", reason });
                            }}>
                            Dispute
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={bold ? "font-bold" : ""}>{v}</div>
    </div>
  );
}
