import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Loader2, Copy, MoreVertical, Pencil, KeyRound, UserX } from "lucide-react";
import { toast } from "sonner";
import { createStaffMember, listHospitalStaff, updateStaffMember, resetStaffPassword, deactivateStaff } from "@/lib/staff.functions";

export const Route = createFileRoute("/hospital/$slug/staff")({ component: StaffPage });

const ROLES = ["owner","hospital_admin","doctor","nurse","receptionist","lab_tech","pharmacist","accountant","ward","daycare","opd","blood_bank","radiology"] as const;

function StaffPage() {
  const { slug } = Route.useParams();
  const fnList = useServerFn(listHospitalStaff);
  const fnDeactivate = useServerFn(deactivateStaff);
  const fnReset = useServerFn(resetStaffPassword);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [resetting, setResetting] = useState<any | null>(null);

  const refresh = () => {
    setLoading(true);
    fnList({ data: { slug } })
      .then((r) => setRows(r as any[]))
      .catch((e: any) => toast.error(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, [slug]);

  return (
    <>
      <AppTopbar title="Staff" subtitle="Create and manage every staff account for this hospital"
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-brand text-primary-foreground hover:opacity-95">
                <Plus className="mr-1.5 h-4 w-4" /> Add staff
              </Button>
            </DialogTrigger>
            <AddStaffDialog slug={slug} onCreated={(info) => { setOpen(false); setCreated(info); refresh(); }} />
          </Dialog>
        } />
      <div className="space-y-4 p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Roles</th>
                  <th className="px-4 py-3 font-medium">Specialization</th>
                  <th className="px-4 py-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
                {!loading && rows.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">No staff yet — add the first member.</td></tr>}
                {!loading && rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{r.display_name || "—"}</td>
                    <td className="px-4 py-3">{r.email || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(r.roles as string[]).map((x) => <Badge key={x} variant="secondary" className="capitalize">{x.replace("_"," ")}</Badge>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.specialization || r.department || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(r)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setResetting(r)}><KeyRound className="mr-2 h-4 w-4" />Reset password</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onClick={async () => {
                              if (!confirm(`Deactivate ${r.display_name}? They will lose access to this hospital.`)) return;
                              try { await fnDeactivate({ data: { slug, userId: r.user_id } }); toast.success("Deactivated"); refresh(); }
                              catch (e: any) { toast.error(e?.message || "Failed"); }
                            }}>
                            <UserX className="mr-2 h-4 w-4" />Deactivate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Staff account created</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Share these credentials with the staff member. They sign in at <span className="font-mono">/login</span>.</p>
          <div className="space-y-2 rounded-md border bg-secondary/30 p-3 text-sm">
            <CredRow label="Email" value={created?.email ?? ""} />
            <CredRow label="Temp password" value={created?.password ?? ""} />
          </div>
          <DialogFooter><Button onClick={() => setCreated(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <EditStaffDialog slug={slug} staff={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />

      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Reset password — {resetting?.display_name}</DialogTitle></DialogHeader>
          <ResetPasswordForm
            onSubmit={async (pwd) => {
              try { await fnReset({ data: { slug, userId: resetting.user_id, password: pwd } }); toast.success("Password updated"); setResetting(null); }
              catch (e: any) { toast.error(e?.message || "Failed"); }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResetPasswordForm({ onSubmit }: { onSubmit: (pwd: string) => void | Promise<void> }) {
  const [pwd, setPwd] = useState("");
  const gen = () => setPwd(Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6) + "-" + Math.floor(10 + Math.random()*89));
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>New temp password</Label>
        <div className="flex gap-2">
          <Input value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="min 8 chars" />
          <Button type="button" size="sm" variant="outline" onClick={gen}>Generate</Button>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={pwd.length < 8} onClick={() => onSubmit(pwd)} className="bg-gradient-brand text-primary-foreground hover:opacity-95">Update password</Button>
      </DialogFooter>
    </div>
  );
}

function EditStaffDialog({ slug, staff, onClose, onSaved }: { slug: string; staff: any | null; onClose: () => void; onSaved: () => void }) {
  const fnUpdate = useServerFn(updateStaffMember);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<typeof ROLES[number]>("doctor");
  const [specialization, setSpecialization] = useState("");
  const [department, setDepartment] = useState("");
  const [fee, setFee] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!staff) return;
    setDisplayName(staff.display_name || "");
    setPhone(staff.phone || "");
    setRole(((staff.roles as string[])[0] as any) || (staff.is_doctor ? "doctor" : "receptionist"));
    setSpecialization(staff.specialization || "");
    setDepartment(staff.department || "");
    setFee(Number(staff.consultation_fee || 0));
  }, [staff]);

  if (!staff) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await fnUpdate({ data: { slug, userId: staff.user_id, displayName, phone, role, specialization, department, consultationFee: role === "doctor" ? fee : 0 } });
      toast.success("Updated");
      onSaved();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!staff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit staff — {staff.email}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Full name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace("_"," ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {role === "doctor" && (
            <>
              <div className="space-y-1.5"><Label>Specialization</Label><Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Consultation fee (Rs)</Label><Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></div>
            </>
          )}
          <div className="space-y-1.5 sm:col-span-2"><Label>Department</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !displayName} onClick={submit} className="bg-gradient-brand text-primary-foreground hover:opacity-95">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono">{value}
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}>
          <Copy className="h-3 w-3" />
        </Button>
      </span>
    </div>
  );
}

function AddStaffDialog({ slug, onCreated }: { slug: string; onCreated: (info: { email: string; password: string }) => void }) {
  const fnCreate = useServerFn(createStaffMember);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<typeof ROLES[number]>("doctor");
  const [specialization, setSpecialization] = useState("");
  const [department, setDepartment] = useState("");
  const [fee, setFee] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const genPwd = () => Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6) + "-" + Math.floor(10 + Math.random()*89);

  const submit = async () => {
    setBusy(true);
    try {
      await fnCreate({ data: {
        slug, email, password, displayName,
        phone: phone || undefined,
        role,
        specialization: specialization || undefined,
        department: department || undefined,
        consultationFee: role === "doctor" ? fee : undefined,
      } });
      toast.success(`${displayName} added`);
      onCreated({ email, password });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Add a staff member</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Full name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Dr. Asma" />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Temp password</Label>
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 chars" />
            <Button type="button" size="sm" variant="outline" onClick={() => setPassword(genPwd())}>Generate</Button>
          </div>
        </div>
        {role === "doctor" && (
          <>
            <div className="space-y-1.5">
              <Label>Specialization</Label>
              <Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="Cardiology" />
            </div>
            <div className="space-y-1.5">
              <Label>Consultation fee (Rs)</Label>
              <Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Department</Label>
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="OPD / Wing A" />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={busy || !displayName || !email || password.length < 8} onClick={submit}
          className="bg-gradient-brand text-primary-foreground hover:opacity-95">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create staff account
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
