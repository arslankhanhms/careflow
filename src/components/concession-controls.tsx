import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Percent, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  requestConcession,
  listConcessionRequests,
  decideConcessionRequest,
} from "@/lib/concession.functions";

/** Doctor-side: button that opens a dialog to propose a concession on an appointment. */
export function ConcessionRequestButton({
  appointmentId,
  patientName,
  consultationFee,
}: {
  appointmentId: string;
  patientName?: string;
  consultationFee?: number;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("");
  const fn = useServerFn(requestConcession);
  const m = useMutation({
    mutationFn: () => fn({ data: { appointment_id: appointmentId, amount: Number(amount) || 0, reason: reason || null } }),
    onSuccess: () => {
      toast.success("Concession request sent to receptionist");
      setOpen(false);
      setAmount(""); setReason("");
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Percent className="mr-1 h-3.5 w-3.5" /> Concession
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request concession{patientName ? ` for ${patientName}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {typeof consultationFee === "number" && consultationFee > 0 && (
              <p className="text-xs text-muted-foreground">Consultation fee: Rs {consultationFee.toLocaleString()}</p>
            )}
            <div>
              <Label htmlFor="cAmt" className="text-xs">Concession amount (Rs)</Label>
              <Input id="cAmt" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500" />
            </div>
            <div>
              <Label htmlFor="cReason" className="text-xs">Reason (optional)</Label>
              <Textarea id="cReason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Senior citizen, staff family" />
            </div>
            <p className="rounded-md bg-primary-soft p-2 text-[11px] text-muted-foreground">
              A notification will be sent to the receptionist. You'll be notified once it's confirmed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending || !Number(amount)}>
              {m.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Percent className="mr-1 h-3.5 w-3.5" />}
              Send to receptionist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Receptionist-side: panel listing pending concession requests with confirm/reject. */
export function ConcessionRequestsPanel({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listConcessionRequests);
  const decideFn = useServerFn(decideConcessionRequest);

  const q = useQuery({
    queryKey: ["concession-req", slug],
    queryFn: () => listFn({ data: { slug, status: "pending" } }),
  });

  useEffect(() => {
    const ch = supabase.channel(`concession-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "concession_requests" },
        () => qc.invalidateQueries({ queryKey: ["concession-req", slug] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [slug, qc]);

  const decide = useMutation({
    mutationFn: (v: { request_id: string; decision: "approve" | "reject"; note?: string }) =>
      decideFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.decision === "approve" ? "Concession applied & doctor notified" : "Rejected & doctor notified");
      qc.invalidateQueries({ queryKey: ["concession-req", slug] });
      qc.invalidateQueries({ queryKey: ["appointments", slug] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const requests = q.data?.requests ?? [];
  if (!q.isLoading && requests.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary-soft/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Percent className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Doctor concession requests</p>
        <Badge variant="secondary" className="text-[10px]">{requests.length} pending</Badge>
      </div>
      {q.isLoading ? (
        <div className="flex justify-center p-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {requests.map((r: any) => {
            const name = r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : "Patient";
            const fee = Number(r.appointment?.consultation_fee ?? 0);
            const payable = Math.max(0, fee - Number(r.amount || 0));
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{name}
                    {r.patient?.mrn && <span className="ml-1 text-xs text-muted-foreground">· {r.patient.mrn}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dr {r.doctor_name} requested <span className="font-mono">Rs {Number(r.amount).toLocaleString()}</span>
                    {fee > 0 && <> · Fee Rs {fee.toLocaleString()} → Payable Rs {payable.toLocaleString()}</>}
                  </p>
                  {r.reason && <p className="mt-0.5 text-xs italic text-muted-foreground">"{r.reason}"</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decide.mutate({ request_id: r.id, decision: "approve" })} disabled={decide.isPending}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Confirm & apply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide.mutate({ request_id: r.id, decision: "reject" })} disabled={decide.isPending}>
                    <X className="mr-1 h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
