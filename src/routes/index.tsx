import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight, CheckCircle2, Loader2, ShieldAlert,
  Brain, ShieldCheck, Eye, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getHospitalBySlugPublic, getMyHospitalRole } from "@/lib/staff.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediFlow AI — AI-powered Hospital & Polyclinic OS" },
      { name: "description", content: "One unified platform for OPD, IPD, Lab, Pharmacy, Billing and AI-driven insights — built for modern hospitals & polyclinics." },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Brain, title: "AI Features", body: "Smart insights for triage, diagnosis and decision-making." },
  { icon: ShieldCheck, title: "Privacy & Security", body: "Secure, role-based, multi-tenant protected data system." },
  { icon: Eye, title: "Transparency", body: "Clear visibility with real-time clinical & revenue data." },
  { icon: MessageSquare, title: "Communication", body: "Unified messaging across doctors, staff and patients." },
];

function Landing() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const fnHospital = useServerFn(getHospitalBySlugPublic);
  const fnRole = useServerFn(getMyHospitalRole);

  const [code, setCode] = useState("");
  const [hospital, setHospital] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const c = code.trim().toLowerCase();
    if (!c) { setHospital(null); setNotFound(false); setVerifying(false); return; }
    setVerifying(true);
    const t = setTimeout(() => {
      fnHospital({ data: { slug: c } })
        .then((r: any) => { if (!r) { setHospital(null); setNotFound(true); } else { setHospital(r); setNotFound(false); } })
        .catch(() => { setHospital(null); setNotFound(true); })
        .finally(() => setVerifying(false));
    }, 300);
    return () => clearTimeout(t);
  }, [code]);

  const goToRoleHome = (targetRole: string | null, s: string) => {
    if (targetRole === "doctor") return navigate({ to: "/doctor/appointments" });
    if (targetRole === "opd") return navigate({ to: "/hospital/$slug/opd", params: { slug: s } });
    if (targetRole === "blood_bank") return navigate({ to: "/hospital/$slug/blood", params: { slug: s } });
    if (targetRole === "radiology") return navigate({ to: "/hospital/$slug/radiology", params: { slug: s } });
    if (targetRole === "lab_tech") return navigate({ to: "/hospital/$slug/lab", params: { slug: s } });
    if (targetRole === "pharmacist") return navigate({ to: "/hospital/$slug/pharmacy", params: { slug: s } });
    if (targetRole === "daycare") return navigate({ to: "/hospital/$slug/daycare", params: { slug: s } });
    if (targetRole === "ward") return navigate({ to: "/hospital/$slug/ipd", params: { slug: s } });
    if (targetRole === "receptionist") return navigate({ to: "/staff/dashboard" });
    return navigate({ to: "/hospital/$slug/", params: { slug: s } });
  };

  const submit = async () => {
    const s = code.trim().toLowerCase();
    if (!hospital || !s) { toast.error("Enter a valid hospital code"); return; }
    if (!email || !password) { toast.error("Email and password are required"); return; }
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) { toast.error(error); return; }
      let verifiedRole: string | null = null;
      try {
        const r: any = await fnRole({ data: { slug: s } });
        verifiedRole = r?.role ?? null;
      } catch {}
      if (!verifiedRole || verifiedRole === "super_admin") {
        toast.error(`You don't have access to /${s}. Contact the hospital admin.`);
        await supabase.auth.signOut();
        return;
      }
      toast.success("Signed in");
      goToRoleHome(verifiedRole, s);
    } finally { setLoading(false); }
  };

  const sendReset = async () => {
    if (!email) { toast.error("Enter your account email"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent");
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-background to-primary-soft/40 lg:h-screen lg:overflow-hidden">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <Button
          onClick={() => navigate({ to: "/patient/login" })}
          className="h-8 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5"
        >
          Patient Sign In
        </Button>
        <Button
          onClick={() => navigate({ to: "/find-doctor" })}
          className="h-8 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700"
        >
          Find a Doctor
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-8 px-6 py-8 lg:h-screen lg:grid-cols-2 lg:gap-14 lg:py-0">
        {/* Header (title + description) */}
        <div className="order-1 flex flex-col items-center text-center lg:order-none lg:col-start-1 lg:row-start-1 lg:self-end lg:items-start lg:text-left">
          <div className="flex items-baseline justify-center gap-1 lg:justify-start">
            <span className="text-4xl font-extrabold tracking-tight text-foreground">Medi</span>
            <span className="text-4xl font-extrabold tracking-tight text-gradient-brand">Flow</span>
          </div>
          <h1 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-foreground">
            The AI-Powered Operating System for Modern Hospitals
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            One unified platform for OPD, IPD, Lab, Pharmacy, Billing, HR and AI-driven insights —
            built for every clinical role in your hospital.
          </p>
        </div>

        {/* Sign-in card */}
        <div className="order-2 flex w-full flex-col items-center lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card/90 p-6 shadow-elegant backdrop-blur-xl">
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Sign in to your hospital</h2>
              <p className="mt-1 text-xs text-muted-foreground">Enter your hospital code and credentials.</p>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Hospital Code</Label>
                <div className="relative">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. ryk_hospital"
                    className="h-10 rounded-xl pr-10 text-sm"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : hospital ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : notFound ? (
                      <ShieldAlert className="h-4 w-4 text-destructive" />
                    ) : null}
                  </span>
                </div>
                {hospital && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <CheckCircle2 className="h-3 w-3" /> Verified: {hospital.name}
                  </p>
                )}
                {notFound && (
                  <p className="text-xs font-medium text-destructive">No hospital found for this code.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@hospital.com"
                  autoComplete="email"
                  className="h-10 rounded-xl text-sm"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Password</Label>
                  <button
                    type="button"
                    onClick={sendReset}
                    className="text-xs font-medium text-primary hover:opacity-80"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-10 rounded-xl text-sm"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>

              <Button
                onClick={submit}
                disabled={loading || !hospital}
                className="h-10 w-full rounded-xl bg-gradient-brand text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-95"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              {hospital ? <>Hospital: <span className="font-semibold text-foreground">{code}</span> · </> : null}
              Accounts are created by administrators.
            </p>
          </div>

        </div>

        {/* Features */}
        <div className="order-3 lg:order-none lg:col-start-1 lg:row-start-2 lg:self-start">
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-3 shadow-soft">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <h3 className="mt-2 text-sm font-semibold text-foreground">{f.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
