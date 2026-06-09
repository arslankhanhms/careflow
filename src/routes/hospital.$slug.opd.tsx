import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ModulePage, NewBtn, StatCard } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { appointmentsToday, wardBeds } from "@/lib/mock-data";
import { BedDouble, Percent, Calculator } from "lucide-react";

export const Route = createFileRoute("/hospital/$slug/opd")({
  head: () => ({ meta: [{ title: "OPD / Ward — MediFlow AI" }] }),
  component: OpdWardPage,
});

function OpdWardPage() {
  const totBeds = wardBeds.reduce((s, w) => s + w.total, 0);
  const occBeds = wardBeds.reduce((s, w) => s + w.occupied, 0);

  return (
    <ModulePage
      title="OPD / Ward"
      subtitle="Outpatient queue, ward beds & concession"
      actions={<NewBtn label="New visit" />}
    >
      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="queue">OPD Queue</TabsTrigger>
          <TabsTrigger value="ward"><BedDouble className="mr-1.5 h-3.5 w-3.5" />Ward</TabsTrigger>
          <TabsTrigger value="concession"><Percent className="mr-1.5 h-3.5 w-3.5" />Concession</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="In queue" value="12" />
            <StatCard label="Waiting > 30m" value="3" tone="warning" />
            <StatCard label="Avg wait" value="14m" tone="info" />
            <StatCard label="Completed today" value="42" tone="success" />
          </div>
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Live consultation queue</h3>
            <ul className="divide-y text-sm">
              {appointmentsToday.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-12 font-mono text-xs text-muted-foreground">{a.time}</span>
                    <div>
                      <p className="font-medium">{a.patient}</p>
                      <p className="text-xs text-muted-foreground">{a.doctor} · {a.dept}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{a.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="ward" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Total beds" value={String(totBeds)} />
            <StatCard label="Occupied" value={String(occBeds)} tone="info" />
            <StatCard label="Available" value={String(totBeds - occBeds)} tone="success" />
            <StatCard label="Occupancy" value={`${Math.round((occBeds / totBeds) * 100)}%`} tone="warning" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {wardBeds.map((w) => {
              const pct = Math.round((w.occupied / w.total) * 100);
              return (
                <Card key={w.ward} className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{w.ward}</h3>
                    <span className="text-sm text-muted-foreground">{w.occupied}/{w.total}</span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{pct}% occupied · {w.total - w.occupied} free</p>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="concession" className="mt-6">
          <ConcessionCalculator />
        </TabsContent>
      </Tabs>
    </ModulePage>
  );
}

function ConcessionCalculator() {
  const [fee, setFee] = useState<number>(1000);
  const [defaultPct, setDefaultPct] = useState<number>(0);
  const [visitPct, setVisitPct] = useState<number>(0);
  const [visitAmt, setVisitAmt] = useState<number>(0);
  const [reason, setReason] = useState<string>("");

  const effectivePct = visitPct > 0 ? visitPct : defaultPct;
  const pctAmount = (fee * effectivePct) / 100;
  const totalConcession = Math.min(fee, pctAmount + visitAmt);
  const payable = Math.max(0, fee - totalConcession);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h3 className="mb-1 text-sm font-semibold">Concession calculator</h3>
        <p className="mb-5 text-xs text-muted-foreground">
          Patient ka default % auto-apply hota hai. Receptionist visit-specific %
          ya flat amount override kar sakte hain.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="fee" className="text-xs">Consultation fee (Rs)</Label>
            <Input id="fee" type="number" min="0" value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="dpct" className="text-xs">Patient default %</Label>
              <Input id="dpct" type="number" min="0" max="100" value={defaultPct} onChange={(e) => setDefaultPct(Number(e.target.value) || 0)} />
              <p className="mt-1 text-[11px] text-muted-foreground">From patient profile</p>
            </div>
            <div>
              <Label htmlFor="vpct" className="text-xs">Visit override %</Label>
              <Input id="vpct" type="number" min="0" max="100" value={visitPct} onChange={(e) => setVisitPct(Number(e.target.value) || 0)} />
              <p className="mt-1 text-[11px] text-muted-foreground">0 = use patient default</p>
            </div>
          </div>
          <div>
            <Label htmlFor="vamt" className="text-xs">Extra flat concession (Rs)</Label>
            <Input id="vamt" type="number" min="0" value={visitAmt} onChange={(e) => setVisitAmt(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label htmlFor="reason" className="text-xs">Reason / note</Label>
            <Input id="reason" placeholder="e.g. Senior citizen, staff family, charity" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95">
            Apply to current visit
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Bill preview</h3>
        </div>
        <dl className="space-y-3 text-sm">
          <Row label="Consultation fee" value={`Rs ${fee.toLocaleString()}`} />
          <Row label={`Concession (${effectivePct}%)`} value={`− Rs ${Math.round(pctAmount).toLocaleString()}`} muted />
          {visitAmt > 0 && <Row label="Flat concession" value={`− Rs ${visitAmt.toLocaleString()}`} muted />}
          <div className="border-t pt-3">
            <Row label="Total concession" value={`− Rs ${Math.round(totalConcession).toLocaleString()}`} bold />
          </div>
          <div className="rounded-md bg-primary-soft p-3">
            <Row label="Payable" value={`Rs ${Math.round(payable).toLocaleString()}`} bold />
          </div>
          {reason && <p className="text-xs text-muted-foreground">Note: {reason}</p>}
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-muted-foreground" : ""}>{label}</dt>
      <dd className={bold ? "font-semibold" : ""}>{value}</dd>
    </div>
  );
}
