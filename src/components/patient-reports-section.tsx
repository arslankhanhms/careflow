import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  registerPatientReport,
  listMyPatientReports,
  analyzePatientReport,
  deletePatientReport,
} from "@/lib/patient-reports.functions";
import { FileUp, FileText, Loader2, Sparkles, Trash2, ExternalLink, ImageIcon } from "lucide-react";

const BUCKET = "patient-reports";

export function PatientReportsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyPatientReports);
  const registerFn = useServerFn(registerPatientReport);
  const analyzeFn = useServerFn(analyzePatientReport);
  const deleteFn = useServerFn(deletePatientReport);

  const q = useQuery({ queryKey: ["my-patient-reports"], queryFn: () => listFn() });
  const reports: any[] = (q.data as any) ?? [];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openReport, setOpenReport] = useState<any | null>(null);

  const analyzeMut = useMutation({
    mutationFn: (id: string) => analyzeFn({ data: { report_id: id } }),
    onSuccess: () => { toast.success("AI analysis complete"); qc.invalidateQueries({ queryKey: ["my-patient-reports"] }); },
    onError: (e: any) => toast.error(e?.message || "AI failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { report_id: id } }),
    onSuccess: () => { toast.success("Report deleted"); qc.invalidateQueries({ queryKey: ["my-patient-reports"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const doUpload = async () => {
    if (!pending) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in");
      const ext = pending.name.split(".").pop() || "bin";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pending, {
        contentType: pending.type || "application/octet-stream",
      });
      if (upErr) throw upErr;
      await registerFn({ data: {
        storage_path: path,
        original_name: pending.name,
        mime_type: pending.type || undefined,
        size_bytes: pending.size,
        title: title || undefined,
        notes: notes || undefined,
      } });
      toast.success("Report uploaded — your doctor has been notified");
      setPending(null); setTitle(""); setNotes("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["my-patient-reports"] });
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">My Lab / Test Reports</h2>
        </div>
        <Badge variant="secondary">{reports.length} uploaded</Badge>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Upload reports from any external lab. AI will summarize them and your doctor will be notified automatically.
      </p>

      <div className="space-y-2 rounded-md border bg-secondary/30 p-3">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <Label className="text-xs">Title (optional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Liver function test" />
          </div>
          <div>
            <Label className="text-xs">File *</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setPending(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Notes for the doctor (optional)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Done at City Lab on 5th Jan" />
        </div>
        <Button onClick={doUpload} disabled={!pending || uploading} className="bg-gradient-brand text-primary-foreground">
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
          Upload & send to doctor
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {q.isLoading && <div className="text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>}
        {!q.isLoading && reports.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">No reports uploaded yet.</p>
        )}
        {reports.map((r) => {
          const isImg = (r.mime_type || "").startsWith("image/");
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                {isImg ? <ImageIcon className="h-5 w-5 shrink-0 text-primary" /> : <FileText className="h-5 w-5 shrink-0 text-primary" />}
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title || r.original_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()} ·{" "}
                    <span className="capitalize">AI: {r.ai_status}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {r.signed_url && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={r.signed_url} target="_blank" rel="noopener"><ExternalLink className="h-3.5 w-3.5" /></a>
                  </Button>
                )}
                {r.ai_status !== "done" && (
                  <Button size="sm" variant="outline"
                    onClick={() => analyzeMut.mutate(r.id)}
                    disabled={analyzeMut.isPending}>
                    {analyzeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                    AI explain
                  </Button>
                )}
                {r.ai_status === "done" && (
                  <Button size="sm" variant="outline" onClick={() => setOpenReport(r)}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> View AI
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(r.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <ReportAiDialog report={openReport} onClose={() => setOpenReport(null)} />
    </Card>
  );
}

export function ReportAiDialog({ report, onClose }: { report: any | null; onClose: () => void }) {
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI analysis</DialogTitle>
        </DialogHeader>
        {report && (
          <div className="-mr-2 flex-1 space-y-4 overflow-y-auto pr-2 text-sm">
            <p className="text-xs text-muted-foreground">{report.title || report.original_name}</p>
            <Section title="Summary" body={report.ai_summary} />
            <Section title="Explanation" body={report.ai_explanation} />
            <Section title="Suggested treatment" body={report.ai_treatment} />
          </div>
        )}
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="whitespace-pre-wrap rounded-md border bg-secondary/30 p-3 text-sm leading-relaxed">{body}</div>
    </div>
  );
}
