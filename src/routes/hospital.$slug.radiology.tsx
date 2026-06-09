import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, NewBtn, StatCard, StatusBadge } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { radiologyQueue } from "@/lib/mock-data";

export const Route = createFileRoute("/hospital/$slug/radiology")({
  head: () => ({ meta: [{ title: "Radiology — MediFlow AI" }] }),
  component: () => (
    <ModulePage title="Radiology" subtitle="Imaging studies · AI pre-read" actions={<NewBtn label="Order study" />}>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Scheduled" value={String(radiologyQueue.filter(r=>r.status==="Scheduled").length)} />
        <StatCard label="In progress" value={String(radiologyQueue.filter(r=>r.status==="In progress").length)} tone="info" />
        <StatCard label="Reported" value={String(radiologyQueue.filter(r=>r.status==="Reported").length)} tone="success" />
        <StatCard label="AI pre-reads" value={String(radiologyQueue.filter(r=>r.aiFinding!=="—"&&r.aiFinding!=="Pending").length)} tone="info" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">{radiologyQueue.map(r=>(
        <Card key={r.id} className="p-5">
          <div className="flex items-start justify-between">
            <div><p className="font-mono text-xs text-muted-foreground">{r.id} · {r.modality}</p>
              <h3 className="mt-1 font-semibold">{r.study}</h3>
              <p className="text-sm text-muted-foreground">{r.patient}</p></div>
            <StatusBadge status={r.status} tone={r.status==="Reported"?"ok":r.status==="In progress"?"info":"muted"} /></div>
          <div className="mt-3 rounded-md bg-primary-soft p-3 text-xs">
            <p className="font-semibold text-primary">AI pre-read</p>
            <p className="mt-0.5 text-foreground">{r.aiFinding}</p></div></Card>
      ))}</div>
    </ModulePage>
  ),
});
