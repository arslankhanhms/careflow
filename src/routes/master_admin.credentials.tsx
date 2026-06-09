import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { updateMasterAdminCredentials } from "@/lib/master-admin.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/master_admin/credentials")({
  component: CredentialsPage,
});

function CredentialsPage() {
  const { user } = useAuth();
  const update = useServerFn(updateMasterAdminCredentials);
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!currentPassword) { toast.error("Enter your current password"); return; }
    if (password && password !== confirm) { toast.error("Passwords do not match"); return; }
    if (password && password.length < 10) { toast.error("Password must be at least 10 characters"); return; }
    const changedEmail = email && email !== user?.email ? email : undefined;
    if (!changedEmail && !password) { toast.error("Nothing to update"); return; }
    setLoading(true);
    try {
      await update({ data: { email: changedEmail, password: password || undefined, currentPassword } });
      toast.success("Credentials updated");
      setPassword(""); setConfirm(""); setCurrentPassword("");
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally { setLoading(false); }
  };

  return (
    <>
      <AppTopbar title="Master Credentials" subtitle="Only the master admin can change these" />
      <div className="p-6">
        <Card className="max-w-xl p-6">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary-soft p-2"><KeyRound className="h-4 w-4 text-primary" /></div>
            <h2 className="text-base font-semibold">Update email & password</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            For security, you must enter your current password to make any change.
          </p>
          <div className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>New password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="leave blank to keep" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm new password</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Current password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <Button onClick={submit} disabled={loading} className="bg-gradient-brand text-primary-foreground hover:opacity-95">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
