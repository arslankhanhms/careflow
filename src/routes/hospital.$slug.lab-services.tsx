import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AppTopbar } from "@/components/layout/app-shell";
import { Loader2, Plus, FlaskConical, ArrowLeft, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { listLabServices, toggleLabService, addLabService, updateLabService } from "@/lib/lab-services.functions";

export const Route = createFileRoute("/hospital/$slug/lab-services")({
  head: () => ({ meta: [{ title: "Lab Services — Admin" }] }),
  component: LabServicesPage,
});

function LabServicesPage() {
  const { slug } = Route.useParams();
  const list = useServerFn(listLabServices);
  const toggle = useServerFn(toggleLabService);
  const update = useServerFn(updateLabService);
  const add = useServerFn(addLabService);
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery({
    queryKey: ["lab-services", slug],
    queryFn: () => list({ data: { slug } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lab-services", slug] });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggle({ data: { slug, ...v } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; price?: number; turnaround_min?: number; urgent_default?: boolean }) =>
      update({ data: { slug, ...v } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const addMut = useMutation({
    mutationFn: (v: { name: string; category: string }) => add({ data: { slug, ...v } }),
    onSuccess: () => { toast.success("Added"); setAddOpen(false); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const grouped = useMemo(() => {
    const rows = q.data ?? [];
    const map: Record<string, any[]> = {};
    for (const r of rows) {
      const k = r.category || "Other";
      (map[k] = map[k] || []).push(r);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [q.data]);

  const enabledCount = (q.data ?? []).filter((r: any) => r.enabled).length;
  const total = (q.data ?? []).length;

  return (
    <>
      <AppTopbar
        title="Lab Services"
        subtitle={`Manage services, prices, turnaround time and urgency defaults · ${enabledCount}/${total} enabled`}
        right={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/hospital/$slug/lab" params={{ slug }}><ArrowLeft className="mr-1 h-4 w-4" />Lab orders</Link>
            </Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-brand text-primary-foreground hover:opacity-95">
                  <Plus className="mr-1.5 h-4 w-4" /> Add service
                </Button>
              </DialogTrigger>
              <AddDialog onSubmit={(v) => addMut.mutate(v)} loading={addMut.isPending} />
            </Dialog>
          </div>
        }
      />
      <div className="space-y-4 p-6">
        {q.isLoading && (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading catalog…
          </div>
        )}
        {q.error && <Card className="p-4 text-sm text-destructive">{(q.error as Error).message}</Card>}
        {grouped.map(([category, items]) => (
          <Card key={category} className="p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b bg-secondary/30 px-4 py-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FlaskConical className="h-4 w-4" /> {category}
              </h3>
              <Badge variant="secondary">{items.filter((i) => i.enabled).length}/{items.length}</Badge>
            </div>
            <div className="divide-y">
              {items.map((s) => (
                <ServiceRow key={s.id} row={s}
                  onToggle={(checked) => toggleMut.mutate({ id: s.id, enabled: checked })}
                  onSavePrice={(price) => updateMut.mutate({ id: s.id, price })}
                  onSaveTat={(turnaround_min) => updateMut.mutate({ id: s.id, turnaround_min })}
                  onToggleUrgent={(urgent_default) => updateMut.mutate({ id: s.id, urgent_default })}
                  busy={toggleMut.isPending || updateMut.isPending}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function ServiceRow({ row, onToggle, onSavePrice, onSaveTat, onToggleUrgent, busy }: {
  row: any;
  onToggle: (v: boolean) => void;
  onSavePrice: (v: number) => void;
  onSaveTat: (v: number) => void;
  onToggleUrgent: (v: boolean) => void;
  busy: boolean;
}) {
  const [price, setPrice] = useState(String(row.price ?? 0));
  const [tat, setTat] = useState(String(row.turnaround_min ?? 60));
  return (
    <div className="grid grid-cols-1 items-center gap-3 px-4 py-2.5 md:grid-cols-[1fr_120px_140px_120px_60px]">
      <div>
        <p className="text-sm font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground font-mono">{row.code}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Rs</span>
        <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)}
          onBlur={() => { const n = Number(price); if (!Number.isNaN(n) && n !== Number(row.price ?? 0)) onSavePrice(n); }}
          className="h-8 w-24 text-right" disabled={busy} />
      </div>
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <Input type="number" min={0} value={tat} onChange={(e) => setTat(e.target.value)}
          onBlur={() => { const n = Number(tat); if (!Number.isNaN(n) && n !== Number(row.turnaround_min ?? 60)) onSaveTat(n); }}
          className="h-8 w-20 text-right" disabled={busy} />
        <span className="text-xs text-muted-foreground">min</span>
      </div>
      <label className="flex items-center gap-1.5 text-xs">
        <AlertTriangle className={`h-3.5 w-3.5 ${row.urgent_default ? "text-destructive" : "text-muted-foreground"}`} />
        <Switch checked={!!row.urgent_default} onCheckedChange={onToggleUrgent} disabled={busy} />
        <span>Urgent</span>
      </label>
      <Switch checked={row.enabled} onCheckedChange={onToggle} disabled={busy} />
    </div>
  );
}

function AddDialog({ onSubmit, loading }: { onSubmit: (v: { name: string; category: string }) => void; loading: boolean }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Pathology");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add a custom lab service</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Service name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vitamin D" /></div>
        <div className="space-y-1.5"><Label>Category *</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Pathology / Radiology / Cardiology / Urology" /></div>
      </div>
      <DialogFooter>
        <Button disabled={loading || !name.trim() || !category.trim()} onClick={() => onSubmit({ name: name.trim(), category: category.trim() })}
          className="bg-gradient-brand text-primary-foreground hover:opacity-95">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
