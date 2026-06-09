import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getHospitalBySlugPublic, getMyHospitalRole } from "@/lib/staff.functions";

export const Route = createFileRoute("/hospital/$slug/auth")({
  head: ({ params }) => ({ meta: [{ title: `Sign in — /${params.slug}` }] }),
  component: HospitalAuthPage,
});

function HospitalAuthPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const fnHospital = useServerFn(getHospitalBySlugPublic);
  const fnRole = useServerFn(getMyHospitalRole);

  const [code, setCode] = useState(slug);
  const [hospital, setHospital] = useState<any>(null);
  const [verifying, setVerifying] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Verify code (debounced)
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
      // Sync URL slug if user changed code
      if (s !== slug) navigate({ to: "/hospital/$slug/auth", params: { slug: s }, replace: true });

      const { error } = await signIn(email, password);
      if (error) { toast.error(error); return; }

      let verifiedRole: string | null = null;
      try {
        const r: any = await fnRole({ data: { slug: s } });
        verifiedRole = r?.role ?? null;
      } catch {}
      if (!verifiedRole) {
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
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-100 px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-[0_20px_60px_-15px_rgba(2,_132,_199,_0.25)] backdrop-blur-xl sm:p-10">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Sign in to your hospital</h1>
            <p className="mt-2 text-sm text-slate-500">Enter your hospital code and credentials.</p>
          </div>

          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-800">Hospital Code</Label>
              <div className="relative">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. ryk_hospital"
                  className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pr-10 text-slate-900 focus-visible:ring-sky-500"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  {verifying ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : hospital ? (
                    <CheckCircle2 className="h-5 w-5 text-sky-600" />
                  ) : notFound ? (
                    <ShieldAlert className="h-5 w-5 text-rose-500" />
                  ) : null}
                </span>
              </div>
              {hospital && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-sky-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verified: {hospital.name}
                </p>
              )}
              {notFound && (
                <p className="text-xs font-medium text-rose-500">No hospital found for this code.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-800">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hospital.com"
                autoComplete="email"
                className="h-12 rounded-xl border-slate-200 bg-slate-50/70 text-slate-900 focus-visible:ring-sky-500"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-slate-800">Password</Label>
                <button
                  type="button"
                  onClick={sendReset}
                  className="text-xs font-medium text-sky-600 hover:text-sky-700"
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
                className="h-12 rounded-xl border-slate-200 bg-slate-50/70 text-slate-900 focus-visible:ring-sky-500"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>

            <Button
              onClick={submit}
              disabled={loading || !hospital}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 text-base font-semibold text-white shadow-lg shadow-sky-600/25 hover:from-sky-500 hover:to-blue-500"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign in
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <p className="mt-8 text-center text-xs text-slate-500">
            {hospital ? <>Hospital: <span className="font-semibold text-slate-700">{code}</span> · </> : null}
            Accounts are created by administrators.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link to="/login" className="hover:text-slate-600">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
