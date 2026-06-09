import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { listDoctorReports, analyzePatientReport } from "@/lib/patient-reports.functions";
import { ReportAiDialog } from "@/components/patient-reports-section";
import { toast } from "sonner";
import {
  Loader2, FileText, Sparkles, ExternalLink, ImageIcon,
  CalendarDays, LayoutDashboard, Stethoscope, TrendingUp, MessageSquare, FlaskConical,
} from "lucide-react";

export const Route = createFileRoute("/doctor/reports")({
  head: () => ({ meta: [{ title: "Patient Reports — Doctor" }] }),
  component: DoctorReportsPage,
});

function DoctorReportsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listDoctorReports);
  const analyzeFn = useServerFn(analyzePatientReport);
  const [filter, setFilter] = useState<"mine" | "all">("mine");
  const [openReport, setOpenReport] = useState<any | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/doctor/login" });
  }, [user, loading, navigate]);

  const q = useQuery({
    queryKey: ["doctor-reports", filter],
    queryFn: () => listFn({ data: { filter } }),
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("patient-reports-doctor")
      .on("postgres_changes", { event: "*", schema: "public", table: "patient_reports" },
        () => qc.invalidateQueries({ queryKey: ["doctor-reports"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const analyzeMut = useMutation({
    mutationFn: (id: string) => analyzeFn({ data: { report_id: id } }),
    onSuccess: () => { toast.success("AI analysis ready"); qc.invalidateQueries({ queryKey: ["doctor-reports"] }); },
    onError: (e: any) => toast.error(e?.message || "AI failed"),
  });

  const sections: SidebarSection[] = [
    { title: "Doctor", items: [
      { label: "Overview", to: "/doctor/overview", icon: LayoutDashboard },
      { label: "Today's Appointments", to: "/doctor/appointments", icon: CalendarDays },
      { label: "My Schedule", to: "/doctor/schedule", icon: LayoutDashboard },
      { label: "My Patients", to: "/doctor/patients", icon: Stethoscope },
      { label: "Patient Reports", to: "/doctor/reports", icon: FlaskConical },
      { label: "Closure Requests", to: "/doctor/closures", icon: FileText },
      { label: "My Earnings", to: "/doctor/earnings", icon: TrendingUp },
      { label: "Messages", to: "/doctor/messages", icon: MessageSquare },
      { label: "AI Assistant", to: "/doctor/ai-assistant", icon: Sparkles },
    ] },
  ];

  const reports: any[] = (q.data as any) ?? [];

  return (
    <div className="flex min-h-screen bg-secondary/30">
      <AppSidebar sections={sections} />
      <div className="flex-1">
        <AppTopbar title="Patient Reports" subtitle="AI-assisted review of patient-uploaded results" />
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Patient Reports</h1>
              <p className="text-sm text-muted-foreground">Reports uploaded by patients from external labs.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={filter === "mine" ? "default" : "outline"} onClick={() => setFilter("mine")}>For me</Button>
              <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All hospital</Button>
            </div>
          </div>

          {q.isLoading && <div className="text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
          {!q.isLoading && reports.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground">No patient-uploaded reports yet.</Card>
          )}

          <div className="space-y-3">
            {reports.map((r) => {
              const isImg = (r.mime_type || "").startsWith("image/");
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {isImg ? <ImageIcon className="mt-1 h-5 w-5 shrink-0 text-primary" /> : <FileText className="mt-1 h-5 w-5 shrink-0 text-primary" />}
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : "Patient"}
                          {r.patient?.mrn && <span className="ml-2 text-xs font-normal text-muted-foreground">MRN {r.patient.mrn}</span>}
                        </p>
                        <p className="text-sm">{r.title || r.original_name}</p>
                        {r.notes && <p className="mt-1 text-xs italic text-muted-foreground">"{r.notes}"</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Uploaded {new Date(r.created_at).toLocaleString()} ·{" "}
                          <Badge variant={r.ai_status === "done" ? "default" : "secondary"} className="capitalize">AI: {r.ai_status}</Badge>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {r.signed_url && (
                        <Button asChild size="sm" variant="ghost">
                          <a href={r.signed_url} target="_blank" rel="noopener"><ExternalLink className="mr-1 h-3 w-3" /> Open file</a>
                        </Button>
                      )}
                      {r.ai_status !== "done" ? (
                        <Button size="sm" variant="outline" onClick={() => analyzeMut.mutate(r.id)} disabled={analyzeMut.isPending}>
                          {analyzeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                          Analyze with AI
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => setOpenReport(r)}>
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> View AI analysis
                        </Button>
                      )}
                    </div>
                  </div>

                  {r.ai_status === "done" && r.ai_summary && (
                    <div className="mt-3 rounded-md border bg-primary-soft/30 p-3 text-xs">
                      <p className="mb-1 font-semibold text-primary">AI Summary</p>
                      <p className="whitespace-pre-wrap leading-relaxed">{r.ai_summary}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <ReportAiDialog report={openReport} onClose={() => setOpenReport(null)} />
        </div>
      </div>
    </div>
  );
}
