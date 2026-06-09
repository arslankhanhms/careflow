import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, LogOut, Receipt, TrendingUp as TrendingUpIcon, CalendarDays,
  LayoutDashboard, FlaskConical, Stethoscope, Sparkles, MessageSquare,
  CheckCircle2, XCircle, Clock, FileSignature,
} from "lucide-react";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { DoctorAiAssistant } from "@/components/doctor-ai-assistant";
import { useAuth } from "@/hooks/use-auth";
import { getMyRoleContext } from "@/lib/dashboard.functions";
import { listCollectionClosures, approveCollectionClosure } from "@/lib/closures.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/doctor/closures")({
  head: () => ({ meta: [{ title: "Closure Requests — Doctor" }] }),
  component: DoctorClosuresPage,
});

function fmt(n: any) {
  return `Rs ${Number(n || 0).toLocaleString()}`;
}

function DoctorClosuresPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const ctxFn = useServerFn(getMyRoleContext);
  const listFn = useServerFn(listCollectionClosures);
  const apprFn = useServerFn(approveCollectionClosure);
  const qc = useQueryClient();

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [user, loading]);

  const ctxQ = useQuery({
    queryKey: ["my-role-ctx"],
    queryFn: () => ctxFn(),
    enabled: !!user,
  });
  const slug = ctxQ.data?.slug ?? null;

  const listQ = useQuery({
    queryKey: ["doctor-closures", slug],
    queryFn: () => listFn({ data: { slug: slug! } }),
    enabled: !!slug,
  });

  useEffect(() => {
    if (!slug) return;
    const ch = supabase.channel(`doctor-closures-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "collection_closures" },
        () => qc.invalidateQueries({ queryKey: ["doctor-closures", slug] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [slug, qc]);

  const decide = useMutation({
    mutationFn: (v: { closureId: string; decision: "approved" | "disputed"; reason?: string }) =>
      apprFn({ data: { slug: slug!, ...v } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["doctor-closures", slug] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const sidebar: SidebarSection[] = [{
    items: [
      { label: "Overview", to: "/doctor/overview", icon: LayoutDashboard },
      { label: "Today's Appointments", to: "/doctor/appointments", icon: CalendarDays },
      { label: "My Schedule", to: "/doctor/schedule", icon: LayoutDashboard },
      { label: "My Patients", to: "/doctor/patients", icon: Stethoscope },
      { label: "Patient Reports", to: "/doctor/reports", icon: FlaskConical },
      { label: "Closure Requests", to: "/doctor/closures", icon: Receipt },
      { label: "My Earnings", to: "/doctor/earnings", icon: TrendingUpIcon },
      { label: "Messages", to: "/doctor/messages", icon: MessageSquare },
      { label: "AI Assistant", to: "/doctor/ai-assistant", icon: Sparkles },
    ],
  }];
  const sidebarFooter = (
    <Button size="sm" variant="outline" className="w-full" onClick={signOut}>
      <LogOut className="mr-1.5 h-3 w-3" /> Sign out
    </Button>
  );

  if (loading || ctxQ.isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  // Only show closures scoped to this doctor or hospital-wide pending requests they can review.
  const all = listQ.data?.closures || [];
  const myClosures = all.filter((c: any) =>
    !c.doctor_user_id || c.doctor_user_id === user?.id
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar sections={sidebar} footer={sidebarFooter} />
      <div className="flex flex-1 flex-col">
        <AppTopbar title="Closure Requests" subtitle={user?.email ?? undefined}
          right={<Badge variant="outline" className="capitalize text-[10px]">Doctor</Badge>} />
        <main className="mx-auto w-full max-w-5xl space-y-5 p-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" /> Daily collection closures
            </h1>
            <p className="text-sm text-muted-foreground">
              End-of-day collection summaries submitted by reception/accounts. Approve or dispute each request.
            </p>
          </div>

          {!slug && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No hospital workspace linked to your account yet.
            </Card>
          )}

          {slug && listQ.isLoading && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </Card>
          )}

          {slug && !listQ.isLoading && myClosures.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              No closure requests yet.
            </Card>
          )}

          <div className="space-y-3">
            {myClosures.map((r: any) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.closure_date}</span>
                      <Badge variant={r.status === "approved" ? "default" : r.status === "disputed" ? "destructive" : "secondary"}>
                        {r.status === "approved" ? <CheckCircle2 className="mr-1 h-3 w-3" /> :
                          r.status === "disputed" ? <XCircle className="mr-1 h-3 w-3" /> :
                            <Clock className="mr-1 h-3 w-3" />}
                        {r.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{r.scope || "opd"}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
                      <Stat label="OPD" v={fmt(r.opd_total)} />
                      <Stat label="Lab" v={fmt(r.lab_total)} />
                      <Stat label="Pharmacy" v={fmt(r.pharmacy_total)} />
                      <Stat label="Cash" v={fmt(r.cash_total)} />
                      <Stat label="Online" v={fmt(r.online_total)} />
                      <Stat label="Total" v={fmt(r.grand_total)} bold />
                    </div>
                    {r.notes && <p className="mt-2 text-xs text-muted-foreground">Notes: {r.notes}</p>}
                    {r.dispute_reason && <p className="mt-1 text-xs text-destructive">Dispute: {r.dispute_reason}</p>}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={decide.isPending}
                        onClick={() => decide.mutate({ closureId: r.id, decision: "approved" })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" disabled={decide.isPending}
                        onClick={() => {
                          const reason = prompt("Dispute reason?");
                          if (reason) decide.mutate({ closureId: r.id, decision: "disputed", reason });
                        }}>
                        Dispute
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </main>
      </div>
      <DoctorAiAssistant />
    </div>
  );
}

function Stat({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={bold ? "font-bold" : ""}>{v}</div>
    </div>
  );
}
