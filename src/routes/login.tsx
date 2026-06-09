import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Building2, KeyRound, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — MediFlow AI" }] }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [step, setStep] = useState<"slug" | "creds">("slug");
  const [hospitalSlug, setHospitalSlug] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const verifySlug = async () => {
    const slug = hospitalSlug.trim().toLowerCase();
    if (!slug) { toast.error("Enter your hospital slug"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hospitals").select("slug,name").eq("slug", slug).maybeSingle();
      if (error) { toast.error(error.message); return; }
      if (!data) { toast.error("Hospital not found. Check the slug with your administrator."); return; }
      // Forward to the per-hospital sign-in screen (role picker + login)
      router.navigate({ to: "/hospital/$slug/auth", params: { slug } });
    } finally { setLoading(false); }
  };

  const handleAuth = async () => {
    if (!email || !password) { toast.error("Email and password are required"); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await signUp(email, password, displayName || undefined);
        if (error) { toast.error(error); return; }
        toast.success("Account created. Check your email to verify, then sign in.");
        setMode("signin");
        return;
      }
      const { error } = await signIn(email, password);
      if (error) { toast.error(error); return; }
      toast.success("Signed in");
      // Detect role and route appropriately
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: roles } = await supabase.from("user_roles").select("role, hospital_id").eq("user_id", user.id);
          const hasAdmin = (roles ?? []).some((r: any) => r.role === "hospital_admin" || r.role === "super_admin");
          const hasDoctor = (roles ?? []).some((r: any) => r.role === "doctor");
          if (hasAdmin) {
            router.navigate({ to: "/hospital/$slug/", params: { slug: hospitalSlug } });
          } else if (hasDoctor) {
            router.navigate({ to: "/doctor/appointments" });
          } else if ((roles ?? []).length > 0) {
            router.navigate({ to: "/staff/dashboard" });
          } else {
            router.navigate({ to: "/hospital/$slug/", params: { slug: hospitalSlug } });
          }
          return;
        }
      } catch {}
      router.navigate({ to: "/hospital/$slug/", params: { slug: hospitalSlug } });
    } finally { setLoading(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-brand p-10 lg:flex lg:flex-col">
        <Link to="/"><Brand variant="light" /></Link>
        <div className="my-auto max-w-md text-primary-foreground">
          <h2 className="font-display text-4xl font-bold leading-tight tracking-tight">
            One platform.<br />Every workflow.<br />AI baked in.
          </h2>
          <p className="mt-4 text-base opacity-90">
            Multi-tenant SaaS for hospitals & polyclinics. Sign in to your hospital workspace.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-xs">
            <Stat n="56" label="Hospitals on platform" />
            <Stat n="78k+" label="Patients managed" />
            <Stat n="8" label="AI assistants" />
            <Stat n="99.99%" label="Uptime SLA" />
          </div>
        </div>
        <p className="text-xs text-white/70">© {new Date().getFullYear()} MediFlow AI</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-elegant">
          <div className="lg:hidden mb-6"><Brand /></div>

          {step === "slug" ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center">
                <div className="rounded-full bg-primary-soft p-3"><Building2 className="h-6 w-6 text-primary" /></div>
                <h2 className="mt-3 text-xl font-semibold">Enter your hospital</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the workspace slug provided by your hospital administrator.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Hospital slug</Label>
                <Input value={hospitalSlug} onChange={(e) => setHospitalSlug(e.target.value)}
                  placeholder="e.g. ryk_hospital" autoFocus
                  onKeyDown={(e) => e.key === "Enter" && verifySlug()} />
                <p className="text-[11px] text-muted-foreground">
                  Workspace URL: /hospital/<span className="font-mono">{hospitalSlug || "your-slug"}</span>
                </p>
              </div>
              <Button onClick={verifySlug} disabled={loading}
                className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <button type="button" onClick={() => setStep("slug")}
                className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="mr-1 h-3 w-3" /> Change hospital
              </button>
              <div>
                <p className="text-xs text-muted-foreground">Hospital workspace</p>
                <p className="font-mono text-sm font-semibold">/{hospitalSlug}</p>
              </div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h2>
                <button type="button" className="text-xs text-primary hover:underline"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                  {mode === "signin" ? "Create account" : "Have an account?"}
                </button>
              </div>
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label>Display name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Dr. Imran" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@hospital.com" autoComplete="email"
                  onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
              </div>
              <Button onClick={handleAuth} disabled={loading}
                className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-lg bg-white/10 p-3 backdrop-blur">
      <p className="text-2xl font-bold">{n}</p>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}
