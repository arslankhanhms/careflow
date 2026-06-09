import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { AppSidebar, type SidebarSection } from "@/components/layout/app-shell";
import { LayoutDashboard, Building2, CreditCard, BarChart3, ShieldCheck, Settings, KeyRound, Loader2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/brand";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/master_admin")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/master_admin") throw redirect({ to: "/master_admin/dashboard" });
  },
  component: MasterAdminLayout,
});

const sections: SidebarSection[] = [
  {
    title: "Master Console",
    items: [
      { label: "Overview",   to: "/master_admin/dashboard",  icon: LayoutDashboard },
      { label: "Hospitals",  to: "/master_admin/hospitals",  icon: Building2 },
      { label: "Plans",      to: "/master_admin/plans",      icon: CreditCard },
      { label: "Analytics",  to: "/master_admin/analytics",  icon: BarChart3 },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Credentials",      to: "/master_admin/credentials", icon: KeyRound },
      { label: "Migrations",       to: "/master_admin/migrations",  icon: Database },
      { label: "Audit & security", to: "/master_admin/dashboard",   icon: ShieldCheck },
      { label: "Settings",         to: "/master_admin/dashboard",   icon: Settings },
    ],
  },
];

function MasterAdminLayout() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { setIsSuper(false); setChecking(false); return; }
    (async () => {
      const { data: ok, error } = await supabase.rpc("is_super_admin", { _user_id: user.id });
      if (error) console.error("is_super_admin rpc failed", error);
      const isSuperRole = !!ok;
      if (!isSuperRole) await supabase.auth.signOut();
      setIsSuper(isSuperRole);
      setChecking(false);
    })();
  }, [user, loading]);

  if (loading || checking) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying access…
    </div>;
  }

  if (!user || !isSuper) return <MasterAdminInlineLogin />;

  return (
    <div className="flex min-h-screen flex-col bg-secondary/30 md:flex-row">
      <AppSidebar
        sections={sections}
        footer={
          <div className="rounded-md bg-primary-soft p-3 text-xs">
            <p className="font-semibold text-primary">MediFlow AI · Master</p>
            <p className="mt-0.5 truncate text-muted-foreground">{user?.email}</p>
            <Button size="sm" variant="outline" className="mt-2 w-full"
              onClick={async () => { await signOut(); router.navigate({ to: "/master_admin" }); }}>
              Sign out
            </Button>
          </div>
        }
      />
      <main className="flex-1"><Outlet /></main>
    </div>
  );
}

function MasterAdminInlineLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) { toast.error("Email and password are required"); return; }
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) { toast.error(error); return; }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { toast.error("Sign-in failed"); return; }
      const { data: ok } = await supabase.rpc("is_super_admin", { _user_id: u.user.id });
      if (!ok) {
        await supabase.auth.signOut();
        toast.error("This account is not a master admin");
        return;
      }
      toast.success("Welcome, Master Admin");
      window.location.assign("/master_admin/dashboard");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-6">
      <Card className="w-full max-w-md p-8 shadow-elegant">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-primary-soft p-3"><ShieldCheck className="h-6 w-6 text-primary" /></div>
          <Brand />
          <h1 className="text-xl font-semibold">Master Admin Console</h1>
          <p className="text-center text-xs text-muted-foreground">
            Restricted access. Master admin credentials only — no public registration.
          </p>
        </div>
        <div className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <Button onClick={submit} disabled={loading}
            className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Sign in
          </Button>
        </div>
      </Card>
    </div>
  );
}
