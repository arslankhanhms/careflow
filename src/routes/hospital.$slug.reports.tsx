import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ModulePage, StatCard } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportAiDialog } from "@/components/patient-reports-section";
import { listDoctorReports, analyzePatientReport } from "@/lib/patient-reports.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink, FileText, FlaskConical, ImageIcon, Loader2, Sparkles, UserRound } from "lucide-react";

export const Route = createFileRoute("/hospital/$slug/reports")({
  head: () => ({ meta: [{ title: "Patient Reports — MediFlow AI" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listDoctorReports);
  const analyzeFn = useServerFn(analyzePatientReport);
  const [openReport, setOpenReport] = useState<any | null>(null);
  const [openPatient, setOpenPatient] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ["hospital-patient-reports", slug],
    queryFn: () => listFn({ data: { filter: "mine" } }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase.channel(`hospital-reports-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "patient_reports" }, () => qc.invalidateQueries({ queryKey: ["hospital-patient-reports", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" }, () => qc.invalidateQueries({ queryKey: ["hospital-patient-reports", slug] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_results" }, () => qc.invalidateQueries({ queryKey: ["hospital-patient-reports", slug] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [slug, qc]);

  const analyzeMut = useMutation({
    mutationFn: (id: string) => analyzeFn({ data: { report_id: id } }),
    onSuccess: () => { toast.success("AI analysis ready"); qc.invalidateQueries({ queryKey: ["hospital-patient-reports", slug] }); },
    onError: (e: any) => toast.error(e?.message || "AI failed"),
  });

  const reports = (q.data ?? []) as any[];
  const labCount = reports.filter((r) => r.source_type === "lab_result").length;
  const uploadCount = reports.length - labCount;

  return (
    <ModulePage title="My Patient Reports" subtitle="Patient-uploaded reports and completed lab results" search={false}>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total reports" value={String(reports.length)} />
        <StatCard label="Patient uploads" value={String(uploadCount)} tone="info" />
        <StatCard label="Lab results" value={String(labCount)} tone="success" />
      </div>

      {q.isLoading && <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      {!q.isLoading && reports.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">No patient reports yet.</Card>}

      <div className="space-y-3">
        {reports.map((r) => {
          const isImg = (r.mime_type || "").startsWith("image/");
          const isLab = r.source_type === "lab_result";
          return (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {isLab ? <FlaskConical className="mt-1 h-5 w-5 shrink-0 text-primary" /> : isImg ? <ImageIcon className="mt-1 h-5 w-5 shrink-0 text-primary" /> : <FileText className="mt-1 h-5 w-5 shrink-0 text-primary" />}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{r.patient ? `${r.patient.first_name ?? ""} ${r.patient.last_name ?? ""}`.trim() : "Patient"}</p>
                      <Badge variant={isLab ? "default" : "secondary"}>{isLab ? "Lab" : "Upload"}</Badge>
                      {r.patient?.mrn && <span className="text-xs text-muted-foreground">MRN {r.patient.mrn}</span>}
                    </div>
                    <p className="text-sm">{r.title || r.original_name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                    {r.notes && <p className="mt-1 text-xs italic text-muted-foreground">{r.notes}</p>}
                    {isLab && r.ai_summary && <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-secondary/30 p-2 text-xs">{r.ai_summary}</pre>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOpenPatient(r.patient)}><UserRound className="mr-1 h-3.5 w-3.5" /> Patient details</Button>
                  {r.signed_url && <Button size="sm" variant="ghost" asChild><a href={r.signed_url} target="_blank" rel="noopener"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Open</a></Button>}
                  {!isLab && (r.ai_status === "done" ? (
                    <Button size="sm" onClick={() => setOpenReport(r)}><Sparkles className="mr-1 h-3.5 w-3.5" /> View AI</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => analyzeMut.mutate(r.id)} disabled={analyzeMut.isPending}>
                      {analyzeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />} AI explain
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <ReportAiDialog report={openReport} onClose={() => setOpenReport(null)} />
      <Dialog open={!!openPatient} onOpenChange={(o) => !o && setOpenPatient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Patient details</DialogTitle></DialogHeader>
          {openPatient && <div className="grid gap-2 text-sm sm:grid-cols-2">
            <Info label="Name" value={`${openPatient.first_name ?? ""} ${openPatient.last_name ?? ""}`} />
            <Info label="MRN" value={openPatient.mrn} />
            <Info label="PMR" value={openPatient.pmr_no} />
            <Info label="CNIC" value={openPatient.cnic} />
            <Info label="Phone" value={openPatient.phone} />
            <Info label="Blood group" value={openPatient.blood_group} />
            <Info label="Sex" value={openPatient.gender || openPatient.sex} />
            <Info label="DOB" value={openPatient.dob} />
          </div>}
        </DialogContent>
      </Dialog>
    </ModulePage>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-md border bg-secondary/30 p-2"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="font-medium">{value || "—"}</p></div>;
}
