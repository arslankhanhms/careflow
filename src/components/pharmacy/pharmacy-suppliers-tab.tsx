import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Truck, Users, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  listSuppliers, upsertSupplier, deleteSupplier,
  listPharmacyCustomers, createPharmacyCustomer,
} from "@/lib/pharmacy.functions";

export function PharmacySuppliersTab({ slug, enabled }: { slug: string; enabled: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SuppliersCard slug={slug} enabled={enabled} />
      <CustomersCard slug={slug} enabled={enabled} />
    </div>
  );
}

function SuppliersCard({ slug, enabled }: { slug: string; enabled: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSuppliers);
  const upsertFn = useServerFn(upsertSupplier);
  const delFn = useServerFn(deleteSupplier);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["pharm-sup", slug, search],
    queryFn: () => listFn({ data: { slug, search } }),
    enabled,
  });
  const upMut = useMutation({
    mutationFn: (d: any) => upsertFn({ data: { slug, ...d } }),
    onSuccess: () => { toast.success("Supplier saved"); setOpen(false); qc.invalidateQueries({ queryKey: ["pharm-sup", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["pharm-sup", slug] }); },
  });

  const rows = q.data?.suppliers ?? [];
  const totalDue = rows.reduce((s: number, r: any) => s + Number(r.balance ?? 0), 0);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Suppliers ({rows.length})</span>
          <Badge variant="outline" className="text-[10px]">Due: Rs {totalDue.toFixed(0)}</Badge>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
            <SupplierForm loading={upMut.isPending} onSubmit={(d) => upMut.mutate(d)} />
            <DialogFooter />
          </DialogContent>
        </Dialog>
      </div>
      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-xs" />
        </div>
      </div>
      {q.isLoading ? <Loading /> : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No suppliers yet.</p>
      ) : (
        <div className="divide-y">
          {rows.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.contact_person ?? ""} {s.phone ? `· ${s.phone}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {Number(s.balance) > 0 && <Badge variant="outline" className="border-warning/30 bg-warning/10 text-xs">Rs {Number(s.balance).toFixed(0)}</Badge>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm(`Delete ${s.name}?`)) delMut.mutate(s.id); }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CustomersCard({ slug, enabled }: { slug: string; enabled: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPharmacyCustomers);
  const createFn = useServerFn(createPharmacyCustomer);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["pharm-cust-tab", slug, search],
    queryFn: () => listFn({ data: { slug, search } }),
    enabled,
  });
  const createMut = useMutation({
    mutationFn: (d: any) => createFn({ data: { slug, ...d } }),
    onSuccess: () => { toast.success("Customer added"); setOpen(false); qc.invalidateQueries({ queryKey: ["pharm-cust-tab", slug] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = q.data?.customers ?? [];
  const totalDue = rows.reduce((s: number, r: any) => s + Number(r.balance ?? 0), 0);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Customers ({rows.length})</span>
          <Badge variant="outline" className="text-[10px]">Receivable: Rs {totalDue.toFixed(0)}</Badge>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><UserPlus className="mr-1 h-3.5 w-3.5" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
            <CustomerForm loading={createMut.isPending} onSubmit={(d) => createMut.mutate(d)} />
            <DialogFooter />
          </DialogContent>
        </Dialog>
      </div>
      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-xs" />
        </div>
      </div>
      {q.isLoading ? <Loading /> : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No customers yet.</p>
      ) : (
        <div className="divide-y">
          {rows.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{c.phone ?? ""} {c.cnic ? `· ${c.cnic}` : ""}</p>
              </div>
              {Number(c.balance) !== 0 && <Badge variant="outline" className="text-xs">Rs {Number(c.balance).toFixed(0)}</Badge>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Loading() { return <div className="flex items-center justify-center p-8 text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>; }

function SupplierForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [v, setV] = useState({ name: "", contact_person: "", phone: "", email: "", address: "", notes: "" });
  return (
    <div className="space-y-2">
      <div><Label>Name *</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Contact person</Label><Input value={v.contact_person} onChange={(e) => setV({ ...v, contact_person: e.target.value })} /></div>
        <div><Label>Phone</Label><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
      </div>
      <div><Label>Email</Label><Input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
      <div><Label>Address</Label><Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></div>
      <Button className="w-full" disabled={loading || !v.name} onClick={() => onSubmit(v)}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
      </Button>
    </div>
  );
}
function CustomerForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [v, setV] = useState({ name: "", phone: "", cnic: "", address: "" });
  return (
    <div className="space-y-2">
      <div><Label>Name *</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Phone</Label><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
        <div><Label>CNIC</Label><Input value={v.cnic} onChange={(e) => setV({ ...v, cnic: e.target.value })} /></div>
      </div>
      <div><Label>Address</Label><Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></div>
      <Button className="w-full" disabled={loading || !v.name} onClick={() => onSubmit(v)}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
      </Button>
    </div>
  );
}
