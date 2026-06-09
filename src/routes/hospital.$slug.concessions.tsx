import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listConcessionRequests, decideConcessionRequest } from "@/lib/concession.functions";
import { Percent, Check, X, Loader2, Clock } from "lucide-react";

export const Route = createFileRoute("/hospital/$slug/concessions")({
  component: ConcessionsPage,
});

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function fmt(n: any) {
  return `Rs ${Number(n || 0).toLocaleString()}`;
}

function ConcessionsPage() {
  const { slug } = useParams({ from: "/hospital/$slug/concessions" });
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("pending");
  const listFn = useServerFn(listConcessionRequests);
  const decideFn = useServerFn(decideConcessionRequest);

  const q = useQuery({
    queryKey: ["concessions-page", slug, status],
    queryFn: () => listFn({ data: { slug, status } }),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`concessions-page-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "concession_requests" }, () =>
        qc.invalidateQueries({ queryKey: ["concessions-page", slug] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [slug, qc]);

  const decide = useMutation({
    mutationFn: (v: { request_id: string; decision: "approve" | "reject" }) => decideFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.decision === "approve" ? "Concession applied & doctor notified" : "Rejected & doctor notified");
      qc.invalidateQueries({ queryKey: ["concessions-page", slug] });
      qc.invalidateQueries({ queryKey: ["appointments", slug] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const rows = q.data?.requests ?? [];
  const pendingCount = rows.filter((r: any) => r.status === "pending").length;
  const approvedTotal = rows
    .filter((r: any) => r.status === "approved")
    .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Percent className="h-5 w-5 text-primary" /> Concessions
          </h1>
          <p className="text-xs text-muted-foreground">
            All doctor concession requests. Approving cuts the amount from the patient's bill and from the doctor's revenue.
          </p>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pending</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{pendingCount}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Approved total (shown)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(approvedTotal)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Filter</CardTitle></CardHeader>
          <CardContent><p className="text-sm font-medium capitalize">{status}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Requests</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No {status === "all" ? "" : status} concession requests.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r: any) => {
                const name = r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : "Patient";
                const fee = Number(r.appointment?.consultation_fee ?? 0);
                const payable = Math.max(0, fee - Number(r.amount || 0));
                return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{name}</p>
                        {r.patient?.mrn && <span className="text-xs text-muted-foreground">· {r.patient.mrn}</span>}
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Dr {r.doctor_name} · concession <span className="font-mono">{fmt(r.amount)}</span>
                        {fee > 0 && <> · Fee {fmt(fee)} → Payable {fmt(payable)}</>}
                      </p>
                      {r.reason && <p className="mt-0.5 text-xs italic text-muted-foreground">"{r.reason}"</p>}
                      {r.decided_at && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Decided {new Date(r.decided_at).toLocaleString()}
                          {r.decision_note ? ` · ${r.decision_note}` : ""}
                        </p>
                      )}
                    </div>
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => decide.mutate({ request_id: r.id, decision: "approve" })} disabled={decide.isPending}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Confirm & apply
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decide.mutate({ request_id: r.id, decision: "reject" })} disabled={decide.isPending}>
                          <X className="mr-1 h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-600"><Check className="mr-1 h-3 w-3" />Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive"><X className="mr-1 h-3 w-3" />Rejected</Badge>;
  return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
}
