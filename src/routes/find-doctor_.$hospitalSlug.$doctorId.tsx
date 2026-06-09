import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Loader2, Calendar, ChevronLeft, ChevronRight, Check, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { getDoctor, getDoctorAvailability } from "@/lib/marketplace.functions";
import { bookAppointmentPublic, bookAppointmentAsMe } from "@/lib/patient-portal.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/find-doctor_/$hospitalSlug/$doctorId")({
  component: DoctorBookingPage,
});

function DoctorBookingPage() {
  const { hospitalSlug, doctorId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fnGetDoctor = useServerFn(getDoctor);
  const fnAvail = useServerFn(getDoctorAvailability);
  const fnBook = useServerFn(bookAppointmentPublic);
  const fnBookMe = useServerFn(bookAppointmentAsMe);

  const [doctor, setDoctor] = useState<any>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [avail, setAvail] = useState<{ slots: any[]; dayOff: boolean; full: boolean; dayEnded?: boolean; workingHoursEnd?: string; nextAvailable: string | null; booked?: number; cap?: number; remaining?: number }>({ slots: [], dayOff: false, full: false, nextAvailable: null });
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Patient form
  const [fullName, setFullName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "unknown">("unknown");
  const [sex, setSex] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [dob, setDob] = useState("");
  const [cnic, setCnic] = useState("");
  const [address, setAddress] = useState("");
  const [diseases, setDiseases] = useState("");
  const [allergies, setAllergies] = useState("");
  const [bloodGroup, setBloodGroup] = useState<"A+"|"A-"|"B+"|"B-"|"AB+"|"AB-"|"O+"|"O-"|"unknown">("unknown");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [payMethod, setPayMethod] = useState<"cash_at_reception" | "jazzcash" | "easypaisa" | "bank_transfer">("cash_at_reception");
  const [payTxn, setPayTxn] = useState("");
  const [payerName, setPayerName] = useState("");

  const formatDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const loadAvailability = async (nextDate = date) => {
    if (!doctor) return;
    const nextAvail = await fnAvail({ data: { doctorId, date: nextDate } });
    setAvail(nextAvail);
    setSelected((current) => current && nextAvail.slots.some((s: any) => s.start === current.start && !s.taken) ? current : null);
  };

  useEffect(() => {
    setLoadingDoc(true);
    fnGetDoctor({ data: { doctorId } }).then(setDoctor).finally(() => setLoadingDoc(false));
  }, [doctorId]);

  const refetchAvail = () => {
    if (!doctor) return;
    loadAvailability().catch(() => {});
  };

  useEffect(() => {
    if (!doctor) return;
    setLoadingSlots(true);
    loadAvailability().finally(() => setLoadingSlots(false));
  }, [doctor, doctorId, date]);

  // Realtime: refresh slots instantly when any appointment changes for this doctor
  useEffect(() => {
    if (!doctor?.user_id) return;
      let channel: any;
      import("@/integrations/supabase/client").then(({ supabase }) => {
      channel = supabase
        .channel(`avail-${doctor.user_id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${doctor.user_id}` }, () => {
          refetchAvail();
        })
        .subscribe();
    });
    return () => {
      if (channel) import("@/integrations/supabase/client").then(({ supabase }) => supabase.removeChannel(channel));
    };
  }, [doctor?.user_id, date]);

  // Prefill patient form from the signed-in user's profile / existing patient row
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles").select("display_name, phone, cnic").eq("user_id", user.id).maybeSingle();
      const { data: pats } = await supabase
        .from("patients").select("first_name, last_name, phone, cnic, dob, gender, address, blood_group")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
      const pat: any = (pats ?? [])[0];
      const fallbackName = prof?.display_name || (pat ? `${pat.first_name ?? ""} ${pat.last_name ?? ""}`.trim() : "");
      setFullName((v) => v || fallbackName);
      setPhone((v) => v || pat?.phone || prof?.phone || "");
      setCnic((v) => v || pat?.cnic || prof?.cnic || "");
      setAddress((v) => v || pat?.address || "");
      setDob((v) => v || pat?.dob || "");
      if (pat?.gender) setGender((g) => g === "unknown" ? pat.gender : g);
      if (pat?.blood_group) setBloodGroup((b) => b === "unknown" ? (pat.blood_group as any) : b);
    })();
  }, [user?.id]);

  const initials = (doctor?.display_name || "Dr").split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  const submit = async () => {
    if (!selected) { toast.error("Pick a time slot"); return; }
    const loggedIn = !!user;
    if (!loggedIn) {
      if (!fullName.trim() || !phone.trim() || !cnic.trim()) {
        toast.error("Full name, phone and CNIC are required");
        return;
      }
      if (!password || password.length < 6) { toast.error("Set a password (at least 6 characters)"); return; }
      if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }
    }
    setConfirming(true);
    try {
      const fee = Number(doctor?.consultation_fee || 0);
      if (fee > 0 && payMethod !== "cash_at_reception" && !payTxn.trim()) {
        toast.error("Please enter the transaction ID from your payment app");
        setConfirming(false); return;
      }
      const weightNum = weightKg ? Number(weightKg) : undefined;
      const payment = fee > 0 ? {
        method: payMethod,
        txnId: payMethod !== "cash_at_reception" ? payTxn.trim() : undefined,
        payerName: payerName.trim() || fullName,
      } : undefined;
      if (loggedIn) {
        // Authenticated booking — no password, details auto-fetched on the server.
        const res = await fnBookMe({
          data: {
            hospitalSlug, doctorId,
            slotStart: selected.start, slotEnd: selected.end,
            patient: {
              fullName: fullName || undefined,
              fatherName: fatherName || undefined,
              phone: phone || undefined, gender,
              sex: sex || undefined,
              weightKg: weightNum && !Number.isNaN(weightNum) ? weightNum : undefined,
              dob: dob || undefined,
              address: address || undefined,
              diseases: diseases || undefined,
              allergies: allergies || undefined,
              bloodGroup: bloodGroup !== "unknown" ? bloodGroup : undefined,
              reason: reason || undefined,
            },
            payment,
          },
        });
        toast.success(`Appointment booked — queue #${res.queueNo}`);
        navigate({ to: "/patient/dashboard" });
        return;
      }
      const res = await fnBook({
        data: {
          hospitalSlug, doctorId,
          slotStart: selected.start, slotEnd: selected.end,
          password,
          patient: {
            fullName, fatherName: fatherName || undefined,
            cnic, phone, gender,
            sex: sex || undefined,
            weightKg: weightNum && !Number.isNaN(weightNum) ? weightNum : undefined,
            dob: dob || undefined, address, diseases, allergies, reason,
            bloodGroup: bloodGroup !== "unknown" ? bloodGroup : undefined,
          },
          payment,
        },
      });
      // Sign the patient in with their chosen password
      await supabase.auth.signInWithPassword({ email: res.email, password });
      toast.success(`Appointment booked — queue #${res.queueNo}`);
      navigate({ to: "/patient/dashboard" });
    } catch (e: any) {
      if (String(e?.message).includes("FULL")) {
        toast.error("This doctor is fully booked today. Try the next available date.");
      } else {
        toast.error(e?.message || "Could not book the appointment");
      }
    } finally { setConfirming(false); }
  };

  const shiftDate = (delta: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(formatDateKey(d));
    setSelected(null);
  };

  if (loadingDoc) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!doctor) {
    return (
      <div className="min-h-screen bg-background"><MarketingHeader />
        <div className="mx-auto max-w-3xl p-10 text-center">
          <p className="text-muted-foreground">Doctor not found.</p>
          <Button asChild className="mt-4"><Link to="/find-doctor">Back to search</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <section className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-8">
          {doctor.photo_url ? (
            <img src={doctor.photo_url} alt={doctor.display_name} className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-soft text-xl font-semibold text-primary">{initials}</div>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{doctor.display_name}</h1>
            <p className="text-sm text-muted-foreground">{doctor.specialization || doctor.department || "General Medicine"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {doctor.hospital && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {doctor.hospital.name} · {doctor.hospital.city}</span>}
              {doctor.experience_years > 0 && <Badge variant="secondary">{doctor.experience_years} yrs experience</Badge>}
              {doctor.working_hours && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {doctor.working_hours.start}–{doctor.working_hours.end}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Consultation fee</p>
            <p className="text-2xl font-bold">{Number(doctor.consultation_fee || 0) > 0 ? `Rs ${Number(doctor.consultation_fee).toLocaleString()}` : "TBD"}</p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pick a date & time</h2>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => shiftDate(-1)} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="inline-flex min-w-[180px] cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:border-primary">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarPicker
                    mode="single"
                    selected={new Date(date + "T00:00:00")}
                    onSelect={(d) => {
                      if (!d) return;
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      setDate(`${y}-${m}-${dd}`);
                      setSelected(null);
                    }}
                    disabled={(d) => {
                      const today0 = new Date(); today0.setHours(0,0,0,0);
                      return d < today0;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button size="icon" variant="outline" onClick={() => shiftDate(1)} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>

          {typeof avail.cap === "number" && avail.cap > 0 && !avail.dayOff && (
            <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Daily capacity</span>
              <span className="font-medium">
                <span className={avail.full ? "text-destructive" : "text-primary"}>{avail.remaining ?? 0}</span> of {avail.cap} slots remaining
                <span className="ml-2 text-muted-foreground">· {avail.booked ?? 0} booked</span>
              </span>
            </div>
          )}

          <div className="mt-5">
            {loadingSlots ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading slots…</div>
            ) : avail.dayOff ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Doctor is off on this day.
                {avail.nextAvailable && (
                  <Button size="sm" variant="link" onClick={() => { setDate(avail.nextAvailable!); setSelected(null); }}>
                    Jump to {new Date(avail.nextAvailable).toLocaleDateString()}
                  </Button>
                )}
              </div>
            ) : (
              <>
              {avail.dayEnded && !avail.full && (
                <div className="mb-3 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-4 text-center text-sm">
                  <p className="font-medium text-destructive">Doctor's working hours are over for today{avail.workingHoursEnd ? ` (ended at ${avail.workingHoursEnd})` : ""}.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Please book for the next available day.</p>
                  {avail.nextAvailable && (
                    <Button size="sm" className="mt-2" onClick={() => { setDate(avail.nextAvailable!); setSelected(null); }}>
                      Book {new Date(avail.nextAvailable).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </Button>
                  )}
                </div>
              )}
              {avail.full && (
                <div className="mb-3 rounded-lg border border-dashed p-4 text-center text-sm">
                  <p className="font-medium">Fully booked</p>
                  {avail.nextAvailable && (
                    <Button size="sm" className="mt-2" onClick={() => { setDate(avail.nextAvailable!); setSelected(null); }}>
                      Try {new Date(avail.nextAvailable).toLocaleDateString()}
                    </Button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {avail.slots.map((s) => {
                  const t = new Date(s.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const active = selected?.start === s.start;
                  const disabled = s.taken || s.past;
                  return (
                    <button key={s.start} type="button"
                      onClick={() => {
                        if (s.past) { toast.error("This time has already passed. Please pick a later slot or another date."); return; }
                        if (s.taken) { toast.error("This time slot is already booked. Please select another available time."); return; }
                        setSelected({ start: s.start, end: s.end });
                      }}
                      aria-disabled={disabled}
                      className={`rounded-md border px-2 py-2 text-xs font-medium transition ${
                        disabled ? "cursor-not-allowed border-border bg-muted text-muted-foreground line-through opacity-60"
                        : active ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary"}`}>
                      {t}{s.past ? <span className="ml-1 text-[9px] uppercase">past</span> : s.taken ? <span className="ml-1 text-[9px] uppercase">booked</span> : null}
                    </button>
                  );
                })}
              </div>
              </>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">Patient details</h2>
          <p className="text-[11px] text-muted-foreground">{user ? "Auto-filled from your profile — edit any field if needed." : "Enter your CNIC and choose a password — we'll create your dashboard automatically."}</p>
          <div className="mt-4 space-y-3">
            <Field label="Full name *"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Imran Ali" /></Field>
            <Field label="Father name"><Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} placeholder="Father's full name" /></Field>
            <Field label="CNIC * (13 digits)"><Input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="35202-XXXXXXX-X" /></Field>
            <Field label="Phone *"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sex">
                <Select value={sex || gender} onValueChange={(v) => { setSex(v); setGender(v as any); }}>
                  <SelectTrigger><SelectValue placeholder="Select sex" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="unknown">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Weight (kg)"><Input type="number" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 72" /></Field>
            </div>
            <Field label="Date of birth"><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
            <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
            <Field label="Symptoms / disease (optional)"><Textarea rows={2} value={diseases} onChange={(e) => setDiseases(e.target.value)} /></Field>
            <Field label="Allergies (optional)"><Input value={allergies} onChange={(e) => setAllergies(e.target.value)} /></Field>
            <Field label="Blood group">
              <Select value={bloodGroup} onValueChange={(v) => setBloodGroup(v as any)}>
                <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A+">A+</SelectItem>
                  <SelectItem value="A-">A-</SelectItem>
                  <SelectItem value="B+">B+</SelectItem>
                  <SelectItem value="B-">B-</SelectItem>
                  <SelectItem value="AB+">AB+</SelectItem>
                  <SelectItem value="AB-">AB-</SelectItem>
                  <SelectItem value="O+">O+</SelectItem>
                  <SelectItem value="O-">O-</SelectItem>
                  <SelectItem value="unknown">Don't know</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reason for visit (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            {!user && (
              <div className="rounded-lg border border-primary/30 bg-primary-soft/30 p-3">
                <p className="text-xs font-semibold text-primary">Set your account password</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">You'll use this CNIC + password to sign in next time.</p>
                <div className="mt-2 grid gap-2">
                  <Field label="Password * (min 6 chars)"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Choose a password" /></Field>
                  <Field label="Confirm password *"><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" /></Field>
                </div>
              </div>
            )}
            {user && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/40 p-3 text-[11px] text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                Signed in as <span className="font-semibold">{user.email}</span>. Your CNIC and previous details are auto-filled — no password needed.
              </div>
            )}
          </div>

          {Number(doctor?.consultation_fee || 0) > 0 && (
            <div className="mt-5 rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Payment</h3>
                <span className="text-sm font-bold">Rs {Number(doctor.consultation_fee).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Choose how you'd like to pay the consultation fee.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([
                  { v: "cash_at_reception", label: "Cash at reception" },
                  { v: "jazzcash", label: "JazzCash" },
                  { v: "easypaisa", label: "EasyPaisa" },
                  { v: "bank_transfer", label: "Bank transfer" },
                ] as const).map((o) => (
                  <button key={o.v} type="button" onClick={() => setPayMethod(o.v)}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition ${payMethod === o.v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              {payMethod !== "cash_at_reception" && (
                <div className="mt-3 space-y-2">
                  {payMethod === "jazzcash" && <p className="rounded bg-background p-2 text-[11px] text-muted-foreground">Send to JazzCash: <span className="font-mono font-semibold">0300-0000000</span></p>}
                  {payMethod === "easypaisa" && <p className="rounded bg-background p-2 text-[11px] text-muted-foreground">Send to EasyPaisa: <span className="font-mono font-semibold">0345-0000000</span></p>}
                  {payMethod === "bank_transfer" && <p className="rounded bg-background p-2 text-[11px] text-muted-foreground">Bank: HBL · Acct: <span className="font-mono font-semibold">1234-5678-9012</span></p>}
                  <Field label="Payer name (optional)"><Input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="As on the sender account" /></Field>
                  <Field label="Transaction ID *"><Input value={payTxn} onChange={(e) => setPayTxn(e.target.value)} placeholder="e.g. TXN123456789" /></Field>
                  <p className="text-[10px] text-muted-foreground">Reception will verify your payment shortly after booking.</p>
                </div>
              )}
            </div>
          )}
          <Button onClick={submit} disabled={confirming || !selected}
            className="mt-5 w-full bg-gradient-brand text-primary-foreground hover:opacity-95">
            {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Confirm appointment
          </Button>
        </Card>
      </div>

      <MarketingFooter />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
