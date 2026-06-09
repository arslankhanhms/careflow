import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ModulePage, StatCard } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wallet, CreditCard, Stethoscope, FlaskConical, Pill, Building2, User } from "lucide-react";
import { getDailyCollections } from "@/lib/collections.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/hospital/$slug/collections")({
  head: () => ({ meta: [{ title: "Daily Collections — MediFlow AI" }] }),
  component: CollectionsPage,
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CollectionsPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const fn = useServerFn(getDailyCollections);
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(todayStr());
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all");

  const q = useQuery({
    queryKey: ["collections", slug, date],
    queryFn: () => fn({ data: { slug, date } }),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`collections-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => qc.invalidateQueries({ queryKey: ["collections", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" },
        () => qc.invalidateQueries({ queryKey: ["collections", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "pharmacy_sales" },
        () => qc.invalidateQueries({ queryKey: ["collections", slug] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, slug, qc]);

  const d = q.data;
  const isToday = date === todayStr();

  return (
    <ModulePage
      title="Daily Collections"
      subtitle={isToday ? "Today · realtime" : `For ${date} · realtime`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
          <Label className="ml-2 text-xs">Doctor</Label>
          <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
            <SelectTrigger className="h-9 w-56"><SelectValue placeholder="All doctors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All doctors</SelectItem>
              {(d?.byDoctor ?? []).map((doc: any) => (
                <SelectItem key={doc.doctor_id} value={doc.doctor_id}>{doc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {q.isLoading && (
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {q.error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{(q.error as Error).message}</div>}

      {d && (
        <>
          {selectedDoctor !== "all" && (() => {
            const doc = (d.byDoctor ?? []).find((x: any) => x.doctor_id === selectedDoctor);
            if (!doc) {
              return <Card className="p-6 text-center text-sm text-muted-foreground">No collections for this doctor {isToday ? "today" : `on ${date}`}.</Card>;
            }
            return (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><User className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.department ?? "—"} · {doc.count} consultation{doc.count === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <StatCard label="Total collected" value={`Rs ${Number(doc.revenue).toLocaleString()}`} tone="success" />
                  <StatCard label="Cash" value={`Rs ${Number(doc.cash).toLocaleString()}`} />
                  <StatCard label="Online + Card" value={`Rs ${Number(doc.online).toLocaleString()}`} tone="info" />
                  <StatCard label="Other" value={`Rs ${Number(doc.other).toLocaleString()}`} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <SourceCard icon={Stethoscope} label="OPD / Consultations" data={{ total: doc.revenue, cash: doc.cash, online: doc.online, other: doc.other, count: doc.count }} />
                </div>
              </>
            );
          })()}

          {selectedDoctor === "all" && (
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Total collected" value={`Rs ${d.grand.total.toLocaleString()}`} tone="success" />
              <StatCard label="Cash" value={`Rs ${d.grand.cash.toLocaleString()}`} />
              <StatCard label="Online + Card" value={`Rs ${d.grand.online.toLocaleString()}`} tone="info" />
              <StatCard label="Other" value={`Rs ${d.grand.other.toLocaleString()}`} />
            </div>
          )}



          {/* By department */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <p className="text-sm font-semibold">Revenue by Department</p>
                <p className="text-xs text-muted-foreground">Based on consultations recorded {isToday ? "today" : `on ${date}`}</p>
              </div>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            {d.byDepartment.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No department revenue yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Consultations</th>
                    <th className="px-4 py-3 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byDepartment.map((r: any) => (
                    <tr key={r.name} className="border-b last:border-0 hover:bg-secondary/40">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{r.count}</Badge></td>
                      <td className="px-4 py-3 font-mono">Rs {Number(r.revenue).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* By doctor */}
          <Card className="p-0">
            <div className="border-b p-4">
              <p className="text-sm font-semibold">Revenue by Doctor</p>
              <p className="text-xs text-muted-foreground">Ranked by collected consultation revenue</p>
            </div>
            {d.byDoctor.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No doctor revenue yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Doctor</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Appointments</th>
                    <th className="px-4 py-3 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byDoctor.map((r: any) => (
                    <tr key={r.doctor_id} className="border-b last:border-0 hover:bg-secondary/40">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.department ?? "—"}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{r.count}</Badge></td>
                      <td className="px-4 py-3 font-mono">Rs {Number(r.revenue).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </ModulePage>
  );
}

function SourceCard({ icon: Icon, label, data }: { icon: any; label: string; data: { total: number; cash: number; online: number; other: number; count: number } }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold">{label}</p>
        </div>
        <Badge variant="outline">{data.count}</Badge>
      </div>
      <p className="mt-3 text-2xl font-bold">Rs {data.total.toLocaleString()}</p>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Wallet className="h-3 w-3" /> Cash</span>
          <span className="font-mono">Rs {data.cash.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><CreditCard className="h-3 w-3" /> Online</span>
          <span className="font-mono">Rs {data.online.toLocaleString()}</span>
        </div>
        {data.other > 0 && (
          <div className="flex items-center justify-between">
            <span>Other</span>
            <span className="font-mono">Rs {data.other.toLocaleString()}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
