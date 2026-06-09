import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Send, Loader2, Trash2, Upload, FileText, ImageIcon,
  CalendarDays, LayoutDashboard, Stethoscope, TrendingUp as TrendingUpIcon,
  LogOut, Bot, X, MessageSquare,
} from "lucide-react";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { askDoctorAssistant, analyzeMedicalImage } from "@/lib/ai-assistants.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/doctor/ai-assistant")({
  component: DoctorAiAssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string };
const KEY = "mediflow-doctor-ai-history-page";

function DoctorAiAssistantPage() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const ask = useServerFn(askDoctorAssistant);
  const analyze = useServerFn(analyzeMedicalImage);

  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });
  const scroller = useRef<HTMLDivElement>(null);

  // Image / report state
  const fileInput = useRef<HTMLInputElement>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgMime, setImgMime] = useState<string>("");
  const [imgDataUrl, setImgDataUrl] = useState<string>("");
  const [imgQuestion, setImgQuestion] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(history.slice(-30))); } catch {}
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  const send = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    const next: Msg[] = [...history, { role: "user", content: question }];
    setHistory(next);
    setQ("");
    try {
      const res = await ask({ data: { question, history: history.slice(-10) } });
      if (res.ok) setHistory([...next, { role: "assistant", content: res.answer }]);
      else toast.error(res.error || "AI failed");
    } catch (e: any) {
      toast.error(e?.message || "AI failed");
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 6_000_000) { toast.error("File too large (max 6MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      setImgDataUrl(url);
      setImgPreview(url);
      setImgMime(f.type || "image/jpeg");
    };
    reader.readAsDataURL(f);
  };

  const runImageAnalysis = async (mode: "detailed" | "summary") => {
    if (!imgDataUrl) { toast.error("Upload an image or report first"); return; }
    setBusy(true);
    const question = mode === "summary"
      ? "Summarize this report/image in 5-6 concise clinical lines: key findings, impression, urgency, and recommended next step."
      : (imgQuestion.trim() || "Analyze this medical image/report in full detail.");
    const userLabel = mode === "summary" ? "📄 Summarize uploaded report (5–6 lines)" : `🖼️ Analyze uploaded report${imgQuestion ? ` — ${imgQuestion}` : ""}`;
    const next: Msg[] = [...history, { role: "user", content: userLabel }];
    setHistory(next);
    try {
      const res = await analyze({ data: { imageDataUrl: imgDataUrl, mimeType: imgMime, question } });
      if (res.ok) setHistory([...next, { role: "assistant", content: res.answer }]);
      else toast.error(res.error || "AI failed");
    } catch (e: any) {
      toast.error(e?.message || "AI failed");
    } finally {
      setBusy(false);
    }
  };

  const clearImage = () => {
    setImgPreview(null); setImgDataUrl(""); setImgMime(""); setImgQuestion("");
    if (fileInput.current) fileInput.current.value = "";
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const doctorSidebar: SidebarSection[] = [{
    items: [
      { label: "Overview", to: "/doctor/overview", icon: LayoutDashboard },
      { label: "Today's Appointments", to: "/doctor/appointments", icon: CalendarDays },
      { label: "My Schedule", to: "/doctor/schedule", icon: LayoutDashboard },
      { label: "My Patients", to: "/doctor/patients", icon: Stethoscope },
      { label: "Patient Reports", to: "/doctor/reports", icon: FileText },
      { label: "Closure Requests", to: "/doctor/closures", icon: FileText },
      { label: "My Earnings", to: "/doctor/earnings", icon: TrendingUpIcon },
      { label: "Messages", to: "/doctor/messages", icon: MessageSquare },
      { label: "AI Assistant", to: "/doctor/ai-assistant", icon: Bot },
    ],
  }];
  const sidebarFooter = (
    <Button size="sm" variant="outline" className="w-full" onClick={signOut}>
      <LogOut className="mr-1.5 h-3 w-3" /> Sign out
    </Button>
  );

  const quickPrompts = [
    "First-line treatment for community-acquired pneumonia in adults",
    "Differential diagnosis for acute chest pain",
    "Paracetamol dose for a 6-year-old (mg/kg)",
    "Warfarin and amoxicillin interaction?",
  ];

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar sections={doctorSidebar} footer={sidebarFooter} />
      <div className="flex flex-1 flex-col">
        <AppTopbar
          title="Clinical AI Assistant"
          subtitle={user?.email ?? undefined}
          right={<Badge variant="outline" className="capitalize text-[10px]">Doctor</Badge>}
        />
        <main className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Sparkles className="h-6 w-6 text-primary" /> MediFlow Clinical AI
              </h1>
              <p className="text-sm text-muted-foreground">
                Ask about diseases, drug doses, interactions, or upload an X-ray / lab report for analysis.
              </p>
            </div>
            <Button variant="outline" size="sm"
              onClick={() => { setHistory([]); try { localStorage.removeItem(KEY); } catch {} }}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear chat
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Chat panel */}
            <Card className="flex h-[70vh] flex-col overflow-hidden lg:col-span-2">
              <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
                {history.length === 0 && (
                  <div className="space-y-3">
                    <div className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground">
                      Ask any clinical question or upload a report on the right panel. Example:{" "}
                      <span className="italic">"First-line treatment for community-acquired pneumonia in adults"</span>.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {quickPrompts.map((p) => (
                        <button key={p} onClick={() => setQ(p)}
                          className="rounded-full border bg-background px-3 py-1 text-xs hover:border-primary hover:bg-primary/5">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {history.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
                    }`}>{m.content}</div>
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                  </div>
                )}
              </div>
              <div className="border-t p-2">
                <div className="flex gap-2">
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
                    placeholder="Ask a clinical question…"
                    disabled={busy}
                  />
                  <Button onClick={send} disabled={busy || !q.trim()}
                    className="bg-gradient-brand text-primary-foreground hover:opacity-95">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Reference only — final clinical judgment lies with the treating physician.
                </p>
              </div>
            </Card>

            {/* Upload / Analyze panel */}
            <Card className="flex h-[70vh] flex-col overflow-hidden p-3">
              <div className="flex items-center gap-2 border-b pb-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Report / X-ray analysis</p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pt-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />

                {!imgPreview ? (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 text-center hover:border-primary hover:bg-primary/5"
                  >
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium">Upload X-ray, scan or lab report</p>
                    <p className="text-[11px] text-muted-foreground">JPG / PNG — max 6MB</p>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-md border">
                      <img src={imgPreview} alt="report preview" className="max-h-64 w-full object-contain bg-black/5" />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute right-2 top-2 rounded-full bg-background/90 p-1 shadow hover:bg-background"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Textarea
                      value={imgQuestion}
                      onChange={(e) => setImgQuestion(e.target.value)}
                      placeholder="Optional: focused question (e.g. 'Is there pneumothorax?')"
                      rows={2}
                      className="text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        onClick={() => runImageAnalysis("detailed")}
                        disabled={busy}
                        className="bg-gradient-brand text-primary-foreground hover:opacity-95"
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" /> Analyze in detail
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runImageAnalysis("summary")}
                        disabled={busy}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Summarize (5–6 lines)
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Choose another file
                    </Button>
                  </div>
                )}

                <div className="rounded-md bg-secondary/50 p-2 text-[11px] text-muted-foreground">
                  Upload chest X-ray, CT, MRI snapshots, ECG, or scanned lab reports. AI will list findings,
                  red flags and suggested next steps. Summarize button gives a quick 5–6 line clinical
                  impression.
                </div>
              </div>
            </Card>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            <Link to="/doctor/appointments" className="hover:underline">← Back to appointments</Link>
          </p>
        </main>
      </div>
    </div>
  );
}
