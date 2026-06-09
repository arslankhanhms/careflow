import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Stethoscope, Sparkles, Plus, ArrowUpRight, Loader2 } from "lucide-react";
import { listHospitalsAdmin } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/master_admin/dashboard")({ component: AdminDashboard });

function AdminDashboard() {
  const fnList = useServerFn(listHospitalsAdmin);
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState({ patients: 0, doctors: 0, ai: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fnList()
      .then((r: any) => { setRows(r.hospitals); setTotals(r.totals); })
      .catch((e: any) => toast.error(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const active = rows.filter((h) => h.status === "active").length;

  return (
    <>
      <AppTopbar title="Master Console" subtitle="Platform overview & operations"
        right={
          <Button asChild className="bg-gradient-brand text-primary-foreground hover:opacity-95">
            <Link to="/master_admin/hospitals"><Plus className="mr-1.5 h-4 w-4" /> Onboard hospital</Link>
          </Button>
        } />
      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat icon={Building2} label="Active hospitals" value={String(active)} hint={`${rows.length} total`} />
          <Stat icon={Users} label="Total patients" value={totals.patients.toLocaleString()} hint="across all tenants" />
          <Stat icon={Stethoscope} label="Doctors" value={totals.doctors.toLocaleString()} hint="across all tenants" />
          <Stat icon={Sparkles} label="AI credits used" value={totals.ai.toLocaleString()} hint="this month" />
        </div>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Hospitals</h3>
            <Button asChild size="sm" variant="ghost"><Link to="/master_admin/hospitals">View all <ArrowUpRight className="ml-1 h-3 w-3" /></Link></Button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No hospitals yet. <Link to="/master_admin/hospitals" className="text-primary hover:underline">Onboard your first tenant</Link>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Hospital</th>
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Doctors</th>
                    <th className="py-2 pr-4 font-medium">Patients</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link to="/hospital/$slug" params={{ slug: h.slug }} className="font-medium hover:text-primary">{h.name}</Link>
                        <p className="text-xs text-muted-foreground">{h.city} · /{h.slug}</p>
                      </td>
                      <td className="py-3 pr-4"><Badge variant="outline" className="capitalize">{h.plan}</Badge></td>
                      <td className="py-3 pr-4">{h.doctors}</td>
                      <td className="py-3 pr-4">{h.patients.toLocaleString()}</td>
                      <td className="py-3 pr-4"><StatusBadge status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value, hint }: any) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="rounded-md bg-primary-soft p-1.5"><Icon className="h-4 w-4 text-primary" /></div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    trial: "bg-info/10 text-info border-info/20",
    suspended: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}
