import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ModulePage, StatusBadge } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listHospitalStaff, createStaffMember } from "@/lib/staff.functions";
import { Plus, Loader2, Stethoscope } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/hospital/$slug/doctors")({
  head: () => ({ meta: [{ title: "Doctors — MediFlow AI" }] }),
  component: DoctorsPage,
});

function DoctorsPage() {
  const { slug } = Route.useParams();
  const listFn = useServerFn(listHospitalStaff);
  const createFn = useServerFn(createStaffMember);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    displayName: "", email: "", password: "", phone: "",
    specialization: "", department: "", consultationFee: "0",
  });

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff", slug],
    queryFn: () => listFn({ data: { slug } }),
  });
  const doctors = (staff ?? []).filter((s: any) => s.is_doctor || (s.roles ?? []).includes("doctor"));

  const submit = async () => {
    if (!form.displayName || !form.email || !form.password) {
      toast.error("Name, email and password are required"); return;
    }
    setSaving(true);
    try {
      await createFn({ data: {
        slug,
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        phone: form.phone || undefined,
        role: "doctor",
        specialization: form.specialization || undefined,
        department: form.department || undefined,
        consultationFee: Number(form.consultationFee) || 0,
      }});
      toast.success("Doctor added");
      setOpen(false);
      setForm({ displayName: "", email: "", password: "", phone: "", specialization: "", department: "", consultationFee: "0" });
      qc.invalidateQueries({ queryKey: ["staff", slug] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to add doctor");
    } finally { setSaving(false); }
  };

  return (
    <ModulePage
      title="Doctors"
      subtitle="Roster, availability & today's load"
      actions={
        <Button size="sm" className="bg-gradient-brand text-primary-foreground hover:opacity-95" onClick={() => {
          setForm({ displayName: "", email: "", password: "", phone: "", specialization: "", department: "", consultationFee: "0" });
          setOpen(true);
        }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add doctor
        </Button>
      }
    >
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading doctors…
          </div>
        ) : doctors.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Stethoscope className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No doctors yet. Click <span className="font-medium">Add doctor</span> to create the first one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Specialization</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Fee</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((d: any) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium">{d.display_name || "—"}</td>
                  <td className="px-4 py-3">{d.specialization || "—"}</td>
                  <td className="px-4 py-3">{d.department || "—"}</td>
                  <td className="px-4 py-3 text-xs">{d.email}</td>
                  <td className="px-4 py-3 font-mono">{d.consultation_fee ?? 0}</td>
                  <td className="px-4 py-3"><StatusBadge status="Active" tone="ok" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add doctor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Full name *</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Dr. Ali Khan" /></div>
              <div className="space-y-1.5"><Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Temp password *</Label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="≥ 8 characters" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Specialization</Label>
                <Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} placeholder="Cardiology" /></div>
              <div className="space-y-1.5"><Label>Department</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="OPD" /></div>
            </div>
            <div className="space-y-1.5"><Label>Consultation fee (PKR)</Label>
              <Input type="number" value={form.consultationFee} onChange={(e) => setForm({ ...form, consultationFee: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-gradient-brand text-primary-foreground hover:opacity-95">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create doctor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModulePage>
  );
}
