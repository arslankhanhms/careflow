import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, NewBtn, StatCard } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { wardBeds } from "@/lib/mock-data";

export const Route = createFileRoute("/hospital/$slug/ipd")({
  head: () => ({ meta: [{ title: "IPD / Ward — MediFlow AI" }] }),
  component: () => {
    const tot = wardBeds.reduce((s,w)=>s+w.total,0); const occ = wardBeds.reduce((s,w)=>s+w.occupied,0);
    return (
      <ModulePage title="IPD / Ward Management" subtitle="Bed allocation across wards" actions={<NewBtn label="Admit patient" />}>
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total beds" value={String(tot)} />
          <StatCard label="Occupied" value={String(occ)} tone="info" />
          <StatCard label="Available" value={String(tot-occ)} tone="success" />
          <StatCard label="Occupancy" value={`${Math.round(occ/tot*100)}%`} tone="warning" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{wardBeds.map(w=>{
          const pct=Math.round(w.occupied/w.total*100);
          return (<Card key={w.ward} className="p-5">
            <div className="flex items-center justify-between"><h3 className="font-semibold">{w.ward}</h3>
              <span className="text-sm text-muted-foreground">{w.occupied}/{w.total}</span></div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${pct}%` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{pct}% occupied · {w.total-w.occupied} free</p></Card>);
        })}</div>
      </ModulePage>
    );
  },
});
