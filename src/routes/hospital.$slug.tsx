import { createFileRoute, Outlet, Link, Navigate, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppSidebar, type SidebarSection } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { getMyHospitalRole } from "@/lib/staff.functions";
import {
  LayoutDashboard, Users, Calendar, Stethoscope, FlaskConical, Pill, Brain,
  Activity, Droplet, Receipt, Sparkles, FileText, Settings, LogOut,
  ScrollText, UserCog, Loader2, ShieldAlert, MessageSquare, Bell, TrendingUp, Wallet,
  FileSignature, ShieldCheck, Percent,

} from "lucide-react";
import { toast } from "sonner";


type Role = "super_admin" | "owner" | "hospital_admin" | "doctor" | "nurse" | "receptionist" | "lab_tech" | "pharmacist" | "accountant" | "ward" | "daycare" | "opd" | "blood_bank" | "radiology";

const ROLE_HOME: Record<Role, string> = {
  super_admin: "/hospital/$slug/",
  owner: "/hospital/$slug/",
  hospital_admin: "/hospital/$slug/",
  doctor: "/hospital/$slug/opd",
  nurse: "/hospital/$slug/opd",
  receptionist: "/hospital/$slug/appointments",
  lab_tech: "/hospital/$slug/lab",
  pharmacist: "/hospital/$slug/pharmacy",
  accountant: "/hospital/$slug/billing",
  ward: "/hospital/$slug/ipd",
  daycare: "/hospital/$slug/daycare",
  opd: "/hospital/$slug/opd",
  blood_bank: "/hospital/$slug/blood",
  radiology: "/hospital/$slug/radiology",
};

const ROLE_ALLOWED_SUFFIXES: Record<Role, string[]> = {
  super_admin: ["", "/patients", "/appointments", "/doctors", "/staff", "/opd", "/daycare", "/lab", "/lab-services", "/lab-billing", "/pharmacy", "/radiology", "/blood", "/ipd", "/ai", "/reports", "/billing", "/collections", "/closures", "/concessions", "/financial-controls", "/earnings", "/audit", "/settings", "/schedule", "/doctor-schedules", "/messages", "/notifications"],
  owner: ["", "/staff", "/doctors", "/reports", "/billing", "/lab-billing", "/collections", "/closures", "/concessions", "/financial-controls", "/earnings", "/audit", "/settings", "/messages", "/notifications"],
  hospital_admin: ["", "/doctors", "/staff", "/patients", "/ai", "/reports", "/billing", "/lab-billing", "/collections", "/closures", "/concessions", "/financial-controls", "/earnings", "/audit", "/settings", "/messages", "/notifications"],
  doctor: ["", "/opd", "/schedule", "/patients", "/reports", "/ai", "/closures", "/financial-controls", "/messages", "/notifications"],
  nurse: ["", "/opd", "/daycare", "/patients", "/messages", "/notifications"],
  receptionist: ["", "/appointments", "/patients", "/billing", "/lab-billing", "/collections", "/closures", "/concessions", "/earnings", "/doctor-schedules", "/messages", "/notifications"],
  lab_tech: ["/lab", "/radiology", "/messages", "/notifications"],
  pharmacist: ["/pharmacy", "/messages", "/notifications"],
  accountant: ["", "/billing", "/lab-billing", "/collections", "/closures", "/concessions", "/reports", "/earnings", "/messages", "/notifications"],
  ward: ["/ipd", "/patients", "/messages", "/notifications"],
  daycare: ["/daycare", "/patients", "/messages", "/notifications"],
  opd: ["/opd", "/appointments", "/patients", "/messages", "/notifications"],
  blood_bank: ["/blood", "/messages", "/notifications"],
  radiology: ["/radiology", "/messages", "/notifications"],
};


export const Route = createFileRoute("/hospital/$slug")({
  component: HospitalLayout,
  errorComponent: HospitalTenantError,
});

function HospitalTenantError({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const { slug } = Route.useParams();
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-6">
      <Card className="w-full max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 text-lg font-semibold">Workspace tab could not open</h2>
        <p className="mt-1 text-sm text-muted-foreground">Please retry this tenant workspace tab.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={reset}>Try again</Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to="/hospital/$slug/appointments" params={{ slug }}>Appointments</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

function sidebarFor(slug: string, role: Role | null): SidebarSection[] {
  const params = { slug };
  const overview = { label: "Overview", to: "/hospital/$slug/", params, icon: LayoutDashboard };
  const messages = { label: "Messages", to: "/hospital/$slug/messages", params, icon: MessageSquare };
  const notifications = { label: "Notifications", to: "/hospital/$slug/notifications", params, icon: Bell };
  const all: Record<Role, SidebarSection[]> = {
    super_admin: [
      { title: "Workspace", items: [overview, { label: "Patients", to: "/hospital/$slug/patients", params, icon: Users }, { label: "Appointments", to: "/hospital/$slug/appointments", params, icon: Calendar }, { label: "Doctors", to: "/hospital/$slug/doctors", params, icon: Stethoscope }, { label: "Staff", to: "/hospital/$slug/staff", params, icon: UserCog }] },
      { title: "Clinical", items: [{ label: "OPD / Ward", to: "/hospital/$slug/opd", params, icon: Stethoscope }, { label: "Day Care", to: "/hospital/$slug/daycare", params, icon: Activity }, { label: "Lab", to: "/hospital/$slug/lab", params, icon: FlaskConical }, { label: "Pharmacy", to: "/hospital/$slug/pharmacy", params, icon: Pill }, { label: "Radiology", to: "/hospital/$slug/radiology", params, icon: Brain }, { label: "Blood Bank", to: "/hospital/$slug/blood", params, icon: Droplet }] },
      { title: "Intelligence", items: [{ label: "AI Assistants", to: "/hospital/$slug/ai", params, icon: Sparkles, badge: "AI" }, { label: "Reports", to: "/hospital/$slug/reports", params, icon: FileText }, { label: "Billing", to: "/hospital/$slug/billing", params, icon: Receipt }] },
      { title: "Admin", items: [{ label: "Lab Services", to: "/hospital/$slug/lab-services", params, icon: FlaskConical }, { label: "Audit Log", to: "/hospital/$slug/audit", params, icon: ScrollText }, { label: "Settings", to: "/hospital/$slug/settings", params, icon: Settings }] },
    ],
    hospital_admin: [
      { title: "Workspace", items: [overview, { label: "Doctors", to: "/hospital/$slug/doctors", params, icon: Stethoscope }, { label: "Staff", to: "/hospital/$slug/staff", params, icon: UserCog }, { label: "Patients", to: "/hospital/$slug/patients", params, icon: Users }] },
      { title: "Business", items: [{ label: "Doctors Earnings", to: "/hospital/$slug/earnings", params, icon: TrendingUp }, { label: "Daily Collections", to: "/hospital/$slug/collections", params, icon: Wallet }, { label: "Collection Closures", to: "/hospital/$slug/closures", params, icon: FileSignature }, { label: "Financial Controls", to: "/hospital/$slug/financial-controls", params, icon: ShieldCheck }, { label: "AI Assistants", to: "/hospital/$slug/ai", params, icon: Sparkles, badge: "AI" }, { label: "Reports", to: "/hospital/$slug/reports", params, icon: FileText }, { label: "Billing", to: "/hospital/$slug/billing", params, icon: Receipt }, { label: "Lab Billing", to: "/hospital/$slug/lab-billing", params, icon: FlaskConical }, { label: "Audit Log", to: "/hospital/$slug/audit", params, icon: ScrollText }, { label: "Settings", to: "/hospital/$slug/settings", params, icon: Settings }] },
    ],
    doctor: [
      { title: "Doctor", items: [overview, { label: "Today's Appointments", to: "/hospital/$slug/schedule", params, icon: Calendar }, { label: "My Schedule", to: "/hospital/$slug/schedule", params, icon: Calendar }, { label: "OPD Queue", to: "/hospital/$slug/opd", params, icon: Stethoscope }, { label: "My Patients", to: "/hospital/$slug/patients", params, icon: Users }, { label: "My Patient Reports", to: "/hospital/$slug/reports", params, icon: FileText }, { label: "AI Assistants", to: "/hospital/$slug/ai", params, icon: Sparkles, badge: "AI" }] },
      { title: "Finance", items: [{ label: "Closure Requests", to: "/hospital/$slug/closures", params, icon: FileSignature }, { label: "Financial Controls", to: "/hospital/$slug/financial-controls", params, icon: ShieldCheck }] },
    ],
    nurse: [
      { title: "Nurse", items: [overview, { label: "Patients", to: "/hospital/$slug/patients", params, icon: Users }, { label: "OPD / Ward", to: "/hospital/$slug/opd", params, icon: Stethoscope }, { label: "Day Care", to: "/hospital/$slug/daycare", params, icon: Activity }] },
    ],
    receptionist: [
      { title: "Reception", items: [overview, { label: "Appointments", to: "/hospital/$slug/appointments", params, icon: Calendar }, { label: "Patients", to: "/hospital/$slug/patients", params, icon: Users }, { label: "Daily Collections", to: "/hospital/$slug/collections", params, icon: Wallet }, { label: "Concessions", to: "/hospital/$slug/concessions", params, icon: Percent }, { label: "Closure Requests", to: "/hospital/$slug/closures", params, icon: FileSignature }, { label: "Doctors Earnings", to: "/hospital/$slug/earnings", params, icon: TrendingUp }, { label: "Billing", to: "/hospital/$slug/billing", params, icon: Receipt }, { label: "Lab Billing", to: "/hospital/$slug/lab-billing", params, icon: FlaskConical }] },
    ],

    lab_tech: [
      { title: "Lab", items: [overview, { label: "Lab Orders", to: "/hospital/$slug/lab", params, icon: FlaskConical }, { label: "Radiology", to: "/hospital/$slug/radiology", params, icon: Brain }] },
    ],
    pharmacist: [
      { title: "Pharmacy", items: [overview, { label: "Pharmacy", to: "/hospital/$slug/pharmacy", params, icon: Pill }] },
    ],
    accountant: [
      { title: "Finance", items: [overview, { label: "Daily Collections", to: "/hospital/$slug/collections", params, icon: Wallet }, { label: "Collection Closures", to: "/hospital/$slug/closures", params, icon: FileSignature }, { label: "Billing", to: "/hospital/$slug/billing", params, icon: Receipt }, { label: "Lab Billing", to: "/hospital/$slug/lab-billing", params, icon: FlaskConical }, { label: "Reports", to: "/hospital/$slug/reports", params, icon: FileText }] },
    ],
    owner: [
      { title: "Owner", items: [overview, { label: "Staff", to: "/hospital/$slug/staff", params, icon: UserCog }, { label: "Doctors", to: "/hospital/$slug/doctors", params, icon: Stethoscope }, { label: "Daily Collections", to: "/hospital/$slug/collections", params, icon: Wallet }, { label: "Collection Closures", to: "/hospital/$slug/closures", params, icon: FileSignature }, { label: "Financial Controls", to: "/hospital/$slug/financial-controls", params, icon: ShieldCheck }, { label: "Reports", to: "/hospital/$slug/reports", params, icon: FileText }, { label: "Billing", to: "/hospital/$slug/billing", params, icon: Receipt }, { label: "Audit Log", to: "/hospital/$slug/audit", params, icon: ScrollText }, { label: "Settings", to: "/hospital/$slug/settings", params, icon: Settings }] },

    ],
    ward: [
      { title: "Ward", items: [overview, { label: "Ward / IPD", to: "/hospital/$slug/ipd", params, icon: Activity }, { label: "Patients", to: "/hospital/$slug/patients", params, icon: Users }] },
    ],
    daycare: [
      { title: "Day Care", items: [overview, { label: "Day Care", to: "/hospital/$slug/daycare", params, icon: Activity }, { label: "Patients", to: "/hospital/$slug/patients", params, icon: Users }] },
    ],
    opd: [
      { title: "OPD", items: [{ label: "OPD Dashboard", to: "/hospital/$slug/opd", params, icon: Stethoscope }, { label: "Appointments", to: "/hospital/$slug/appointments", params, icon: Calendar }, { label: "Patients", to: "/hospital/$slug/patients", params, icon: Users }] },
    ],
    blood_bank: [
      { title: "Blood Bank", items: [{ label: "Blood Bank Dashboard", to: "/hospital/$slug/blood", params, icon: Droplet }] },
    ],
    radiology: [
      { title: "Radiology", items: [overview, { label: "Radiology", to: "/hospital/$slug/radiology", params, icon: Brain }] },
    ],
  };
  if (!role) return [];
  return [...all[role], { title: "Communication", items: [messages, notifications] }];
}

function HospitalLayout() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fnRole = useServerFn(getMyHospitalRole);
  const [role, setRole] = useState<Role | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  // Auth route is a standalone full-screen page — bypass workspace chrome entirely.
  const isAuthRoute = location.pathname.replace(/\/$/, "").endsWith("/auth");

  useEffect(() => {
    if (isAuthRoute) return;
    if (authLoading) return;
    if (!user) { setRoleChecked(true); return; }
    // Reset on user/slug change so we don't briefly show stale "no role".
    setRoleChecked(false);
    setRole(null);
    fnRole({ data: { slug } })
      .then((r: any) => setRole((r.role ?? null) as Role | null))
      .catch((e: any) => toast.error(e?.message || "Failed to load role"))
      .finally(() => setRoleChecked(true));
  }, [user?.id, authLoading, slug, isAuthRoute]);

  if (isAuthRoute) return <Outlet />;

  // While auth or role check is in flight, ALWAYS show loader.
  // This prevents the brief "Access denied" flash that appears after login while the role RPC resolves.
  if (authLoading || (user && !roleChecked)) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workspace…</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-6">
        <Card className="w-full max-w-sm p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Sign-in required</h2>
          <p className="mt-1 text-sm text-muted-foreground">This is a private hospital workspace.</p>
          <Button asChild className="mt-4 w-full">
            <Link to="/hospital/$slug/auth" params={{ slug }}>Sign in to /{slug}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-6">
        <Card className="w-full max-w-sm p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <h2 className="mt-3 text-lg font-semibold">No workspace access</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your account doesn't have a role at <span className="font-mono">/{slug}</span>. Ask the hospital admin to add you.</p>
          <Button variant="outline" className="mt-4 w-full" onClick={async () => { await signOut(); navigate({ to: "/hospital/$slug/auth", params: { slug } }); }}>Sign out</Button>
        </Card>
      </div>
    );
  }

  // super_admin is allowed to inspect any hospital workspace; no forced redirect.


  const hospitalBase = `/hospital/${slug}`;
  const routeSuffix = location.pathname === `${hospitalBase}/` || location.pathname === hospitalBase
    ? ""
    : location.pathname.slice(hospitalBase.length).replace(/\/$/, "");
  const allowed = ROLE_ALLOWED_SUFFIXES[role] ?? [];
  const canOpenRoute = allowed.some((s) => routeSuffix === s || (s !== "" && routeSuffix.startsWith(s + "/")));
  if (!canOpenRoute) {
    return <Navigate to={ROLE_HOME[role] as never} params={{ slug } as never} replace />;
  }

  const sections = sidebarFor(slug, role);

  return (
    <div className="flex min-h-screen flex-col bg-secondary/30 md:flex-row">
      <AppSidebar
        sections={sections}
        footer={
          <div className="rounded-md bg-primary-soft p-3 text-xs">
            <p className="font-semibold text-primary truncate">/{slug}</p>
            <p className="mt-0.5 text-muted-foreground truncate capitalize">Role: {role.replace("_", " ")}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground truncate">{user.email}</p>
            <div className="mt-2">
              <Button size="sm" variant="outline" className="w-full"
                onClick={async () => { await signOut(); toast.success("Signed out"); navigate({ to: "/login" }); }}>
                <LogOut className="mr-1.5 h-3 w-3" /> Sign out
              </Button>
            </div>
          </div>
        }
      />
      <main className="flex-1"><Outlet /></main>
    </div>
  );
}
