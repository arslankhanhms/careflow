import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/brand";
import { Loader2, KeyRound, IdCard, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { patientLoginLookup } from "@/lib/patient-portal.functions";

export const Route = createFileRoute("/patient/login")({
  head: () => ({ meta: [{ title: "Patient sign in — MediFlow AI" }] }),
  validateSearch: (s) => ({ redirect: typeof s.redirect === "string" ? s.redirect : "/patient/dashboard" }),
  component: PatientLogin,
});

function PatientLogin() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const fnLookup = useServerFn(patientLoginLookup);
  const [cnic, setCnic] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!cnic) { toast.error("Enter your CNIC"); return; }
    if (!password) { toast.error("Enter your password"); return; }
    setLoading(true);
    try {
      const res = await fnLookup({ data: { cnic } });
      if (!res.exists) {
        toast.message("No record found for this CNIC. Please book an appointment first.");
        navigate({ to: "/find-doctor" });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: res.email, password });
      if (error) { toast.error("Wrong password. Please try again."); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1);
        if (roles && roles.length > 0) {
          await supabase.auth.signOut();
          toast.error("This is a staff account. Use the staff sign-in.");
          navigate({ to: "/login" });
          return;
        }
      }
      toast.success("Welcome back");
      navigate({ to: search.redirect as any });
    } catch (e: any) { toast.error(e?.message || "Sign in failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-soft p-6">
      <Card className="w-full max-w-md p-8 shadow-elegant">
        <div className="mb-6 flex justify-center"><Brand /></div>
        <h1 className="text-center text-xl font-semibold">Patient sign in</h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Sign in with your CNIC and the password you chose during booking.
        </p>
        <div className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5" /> CNIC</Label>
            <Input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="13 digits" inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password"
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <Button onClick={submit} disabled={loading} className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />} Sign in
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          First time? <Link to="/find-doctor" className="text-primary hover:underline">Book an appointment</Link>
        </p>
      </Card>
    </div>
  );
}
