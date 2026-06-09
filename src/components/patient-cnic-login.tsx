import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IdCard, KeyRound, Loader2, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { patientLoginLookup } from "@/lib/patient-portal.functions";
import { useAuth } from "@/hooks/use-auth";

export function PatientCnicLogin({ variant = "card", className = "" }: { variant?: "card" | "inline"; className?: string }) {
  const navigate = useNavigate();
  const fnLookup = useServerFn(patientLoginLookup);
  const { user, loading: authLoading } = useAuth();
  const [cnic, setCnic] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (authLoading) return null;
  // Hide the form entirely once the user is signed in.
  if (user) return null;

  const submit = async () => {
    if (!cnic) { toast.error("Enter your CNIC"); return; }
    if (!password) { toast.error("Enter your password"); return; }
    setLoading(true);
    try {
      const res = await fnLookup({ data: { cnic } });
      if (!res.exists) {
        toast.message("No record found for this CNIC. Please book an appointment to get started.");
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
      navigate({ to: "/patient/dashboard" });
    } catch (e: any) { toast.error(e?.message || "Sign in failed"); }
    finally { setLoading(false); }
  };

  const body = (
    <>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Patient sign in</p>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Sign in with your CNIC and the password you set during booking.
      </p>
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5 text-xs"><IdCard className="h-3.5 w-3.5" /> CNIC</Label>
          <Input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="13 digits" inputMode="numeric" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5 text-xs"><Lock className="h-3.5 w-3.5" /> Password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password"
            onKeyDown={(e) => e.key === "Enter" && submit()} className="h-9" />
        </div>
        <Button onClick={submit} disabled={loading} size="sm"
          className="w-full bg-gradient-brand text-primary-foreground hover:opacity-95">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />} Sign in
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        First time? <Link to="/find-doctor" className="text-primary hover:underline">Book an appointment</Link>
      </p>
    </>
  );

  if (variant === "inline") return <div className={className}>{body}</div>;
  return <Card className={`p-5 shadow-elegant ${className}`}>{body}</Card>;
}
