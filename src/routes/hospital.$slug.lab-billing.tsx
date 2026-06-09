import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ModulePage, StatCard, StatusBadge } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLabOrdersForBilling, recordLabPayment } from "@/lib/lab.functions";
import { downloadPaymentReceipt } from "@/lib/payment-receipt";
import { Loader2, Receipt, Wallet, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/hospital/$slug/lab-billing")({
  head: () => ({ meta: [{ title: "Lab Billing — MediFlow AI" }] }),
  component: LabBillingPage,
});

function LabBillingPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const list = useServerFn(listLabOrdersForBilling);
  const pay = useServerFn(recordLabPayment);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "paid" | "all">("pending");
  const [target, setTarget] = useState<any | null>(null);
  const [receipt, setReceipt] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ["lab-billing", slug, filter],
    queryFn: () => list({ data: { slug, filter } }),
    enabled: !!user,
  });

  // Always-fresh totals (independent of the filter shown in the table).
  const statsQ = useQuery({
    queryKey: ["lab-billing-stats", slug],
    queryFn: () => list({ data: { slug, filter: "all" } }),
    enabled: !!user,
    refetchInterval: 15_000,
  });

  const payMut = useMutation({
    mutationFn: (v: { orderId: string; amount: number; method: any }) => pay({ data: v }),
    onSuccess: (res: any) => {
      toast.success("Payment recorded — receipt ready");
      setTarget(null);
      if (res?.receipt) setReceipt(res.receipt);
      qc.invalidateQueries({ queryKey: ["lab-billing", slug] });
      qc.invalidateQueries({ queryKey: ["lab-billing-stats", slug] });
      qc.invalidateQueries({ queryKey: ["lab", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`lab-billing-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" }, () => {
        qc.invalidateQueries({ queryKey: ["lab-billing", slug] });
        qc.invalidateQueries({ queryKey: ["lab-billing-stats", slug] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, slug, qc]);

  const rows = q.data ?? [];
  const statRows = statsQ.data ?? [];
  const pendingCount = statRows.filter((r: any) => r.payment_status === "pending").length;
  const paidCount = statRows.filter((r: any) => r.payment_status === "paid").length;
  const pendingAmount = statRows.filter((r: any) => r.payment_status === "pending")
    .reduce((s: number, r: any) => s + Number(r.amount_due ?? 0), 0);
  const collected = statRows.filter((r: any) => r.payment_status === "paid")
    .reduce((s: number, r: any) => s + Number(r.paid_amount ?? r.amount_due ?? 0), 0);


  return (
    <ModulePage title="Lab Billing" subtitle="Collect payment for lab orders · realtime">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Pending bills" value={String(pendingCount)} tone="warning" />
        <StatCard label="Amount due" value={`Rs ${pendingAmount.toLocaleString()}`} tone="warning" />
        <StatCard label="Paid orders" value={String(paidCount)} tone="success" />
        <StatCard label="Collected" value={`Rs ${collected.toLocaleString()}`} tone="success" />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filter</span>
          {(["pending", "paid", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        {q.isLoading && (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {q.data && rows.length === 0 && (
          <div className="flex flex-col items-center p-12 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No {filter} lab bills</p>
          </div>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Tests</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-3 font-mono text-xs">{r.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.patient?.first_name} {r.patient?.last_name}</div>
                      <div className="text-xs text-muted-foreground">{r.patient?.mrn}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{(r.tests ?? []).join(", ")}</td>
                    <td className="px-4 py-3 font-semibold">Rs {Number(r.amount_due ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={r.payment_status}
                        tone={r.payment_status === "paid" ? "ok" : "warn"}
                      />
                      {r.payment_status === "paid" && (
                        <div className="mt-1 text-[11px] text-muted-foreground">{r.payment_method}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.payment_status === "pending" ? (
                        <Button size="sm" onClick={() => setTarget(r)}>
                          <Wallet className="mr-1 h-3.5 w-3.5" /> Collect
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {target && (
        <PaymentDialog
          order={target}
          saving={payMut.isPending}
          onClose={() => setTarget(null)}
          onSubmit={(v) => payMut.mutate({ orderId: target.id, ...v })}
        />
      )}

      {receipt && (
        <Dialog open onOpenChange={(o) => !o && setReceipt(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Payment received
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div className="rounded-md border bg-secondary/40 p-3">
                <p className="font-medium">{receipt.patientName}</p>
                <p className="text-xs text-muted-foreground">{receipt.testsLabel}</p>
                <p className="mt-2 text-xs">Receipt #: <span className="font-mono">{receipt.receiptNo}</span></p>
                <p className="text-xs">Amount: <strong>Rs {Number(receipt.amount || 0).toLocaleString()}</strong> · {String(receipt.method).toUpperCase()}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Notifications have been sent to the patient, lab, and referring doctor.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setReceipt(null)}>Close</Button>
              <Button onClick={() => downloadPaymentReceipt(receipt)}>
                <Download className="mr-2 h-4 w-4" /> Download receipt
              </Button>
              <Button variant="secondary" onClick={() => downloadPaymentReceipt({ ...receipt, autoPrint: true })}>
                <Receipt className="mr-2 h-4 w-4" /> Print
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ModulePage>
  );
}

function PaymentDialog({ order, onClose, onSubmit, saving }: {
  order: any; onClose: () => void; saving: boolean;
  onSubmit: (v: { amount: number; method: any }) => void;
}) {
  const [amount, setAmount] = useState<string>(String(order.amount_due ?? 0));
  const [method, setMethod] = useState<"cash" | "card" | "online" | "bank_transfer" | "other">("cash");
  const num = Number(amount);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collect payment · {order.patient?.first_name} {order.patient?.last_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-secondary/40 p-3 text-xs">
            <div className="font-medium">{(order.tests ?? []).join(", ")}</div>
            <div className="mt-1 text-muted-foreground">Computed: Rs {Number(order.computed_amount ?? 0).toLocaleString()}</div>
          </div>
          <div>
            <Label>Amount (Rs) *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} />
          </div>
          <div>
            <Label>Method *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !(num >= 0)} onClick={() => onSubmit({ amount: num, method })}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
