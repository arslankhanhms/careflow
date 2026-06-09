import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Send, ImagePlus, X, Bot, User, FileText } from "lucide-react";
import { askDoctorAssistant, analyzeMedicalImage } from "@/lib/ai-assistants.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/hospital/$slug/ai")({
  head: () => ({ meta: [{ title: "AI Assistant — MediFlow AI" }] }),
  component: AIPage,
});

function AIPage() {
  return (
    <>
      <AppTopbar title="AI Assistant" subtitle="Ask about any disease, or upload an X-ray / lab report for analysis." />
      <div className="p-6">
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="mb-4 grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="chat"><Bot className="mr-1.5 h-3.5 w-3.5" /> Ask AI</TabsTrigger>
            <TabsTrigger value="image"><ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Analyze Report / X-ray</TabsTrigger>
          </TabsList>
          <TabsContent value="chat"><ChatPanel /></TabsContent>
          <TabsContent value="image"><ImagePanel /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

type Msg = { role: "user" | "assistant"; content: string };

function ChatPanel() {
  const ask = useServerFn(askDoctorAssistant);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    const history = messages.slice(-10);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res: any = await ask({ data: { question: q, history } });
      if (res.ok) setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
      else toast.error(res.error || "AI failed");
    } catch (e: any) {
      toast.error(e?.message || "AI failed");
    } finally { setLoading(false); }
  };

  return (
    <Card className="flex h-[70vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <Sparkles className="mb-2 h-8 w-8 text-primary opacity-60" />
            <p className="font-medium text-foreground">Ask the AI about any disease, drug, or protocol.</p>
            <p className="mt-1 max-w-md">e.g. "First-line treatment for community-acquired pneumonia in adults", "Differential for chronic cough", "Dosing of amoxicillin in 5y child 18kg".</p>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && <div className="mt-1 rounded-full bg-primary-soft p-1.5"><Bot className="h-3.5 w-3.5 text-primary" /></div>}
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              {m.content}
            </div>
            {m.role === "user" && <div className="mt-1 rounded-full bg-secondary p-1.5"><User className="h-3.5 w-3.5" /></div>}
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
      </div>
      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            placeholder="Ask about a disease, drug, or treatment protocol…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            className="resize-none"
          />
          <Button onClick={send} disabled={loading || !input.trim()} className="bg-gradient-brand text-primary-foreground">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ImagePanel() {
  const analyze = useServerFn(analyzeMedicalImage);
  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<{ dataUrl: string; mime: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"analyze" | "summarize" | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const renderPdf = async (f: File): Promise<{ dataUrl: string; mime: string }[]> => {
    // @ts-ignore - pdfjs worker path resolved at runtime
    const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = (worker as any).default;
    const buf = await f.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const max = Math.min(doc.numPages, 3);
    const out: { dataUrl: string; mime: string }[] = [];
    for (let i = 1; i <= max; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      out.push({ dataUrl: canvas.toDataURL("image/jpeg", 0.85), mime: "image/jpeg" });
    }
    return out;
  };

  const onPick = async (f: File | null) => {
    setAnswer(null);
    if (!f) { setFile(null); setPreviews([]); return; }
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) { toast.error("Upload an image or PDF report / X-ray"); return; }
    if (f.size > 12 * 1024 * 1024) { toast.error("File must be under 12 MB"); return; }
    setFile(f);
    try {
      if (isPdf) {
        toast.message("Rendering PDF…");
        const pages = await renderPdf(f);
        setPreviews(pages);
        toast.success(`Loaded ${pages.length} page${pages.length > 1 ? "s" : ""}`);
      } else {
        const reader = new FileReader();
        reader.onload = () => setPreviews([{ dataUrl: reader.result as string, mime: f.type }]);
        reader.readAsDataURL(f);
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not read the file");
      setFile(null); setPreviews([]);
    }
  };

  const runAnalysis = async (kind: "analyze" | "summarize") => {
    if (!previews.length) { toast.error("Please upload a file first"); return; }
    setLoading(true); setAnswer(null); setMode(kind);
    const basePrompt = kind === "summarize"
      ? "Summarize this medical report / image in a short bullet list a physician can scan in 15 seconds. Include: key findings, abnormal values with flag (H/L/critical), one-line impression, and suggested next step."
      : (question.trim() || "Analyze this medical image/report and give a full clinical interpretation.");
    try {
      const parts: string[] = [];
      for (let i = 0; i < previews.length; i++) {
        const p = previews[i];
        const userPrompt = previews.length > 1
          ? `${basePrompt}\n\n(Page ${i + 1} of ${previews.length})`
          : basePrompt;
        const res: any = await analyze({ data: { imageDataUrl: p.dataUrl, mimeType: p.mime, question: userPrompt } });
        if (!res.ok) { toast.error(res.error || "AI failed"); setLoading(false); return; }
        parts.push(previews.length > 1 ? `## Page ${i + 1}\n${res.answer}` : res.answer);
      }
      setAnswer(parts.join("\n\n"));
    } catch (e: any) {
      toast.error(e?.message || "AI failed");
    } finally { setLoading(false); }
  };

  const clear = () => { setFile(null); setPreviews([]); setAnswer(null); if (inputRef.current) inputRef.current.value = ""; };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Upload X-ray / lab report</h3>
        <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, or PDF (first 3 pages). Up to 12 MB.</p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />

        {!previews.length ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-4 flex h-56 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground transition hover:bg-secondary/40"
          >
            <ImagePlus className="mb-2 h-8 w-8 opacity-50" />
            Click to upload an image or PDF
          </button>
        ) : (
          <div className="mt-4 relative space-y-2">
            {previews.map((p, i) => (
              <img key={i} src={p.dataUrl} alt={`page-${i + 1}`} className="max-h-72 w-full rounded-lg border object-contain bg-secondary/40" />
            ))}
            <Button size="icon" variant="secondary" className="absolute right-2 top-2" onClick={clear}>
              <X className="h-4 w-4" />
            </Button>
            {file && <p className="text-xs text-muted-foreground">{file.name} · {previews.length} page{previews.length > 1 ? "s" : ""}</p>}
          </div>
        )}

        <div className="mt-4">
          <Textarea
            placeholder="Optional: ask a specific question (e.g. 'Any signs of pneumonia?', 'Interpret the CBC')"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => runAnalysis("analyze")} disabled={loading || !previews.length} className="bg-gradient-brand text-primary-foreground">
            {loading && mode === "analyze" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="mr-2 h-4 w-4" /> Analyze</>}
          </Button>
          <Button onClick={() => runAnalysis("summarize")} disabled={loading || !previews.length} variant="outline">
            {loading && mode === "summarize" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Summarizing…</> : <><FileText className="mr-2 h-4 w-4" /> Summarize</>}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">AI interpretation</h3>
        </div>
        {!answer && !loading && (
          <p className="mt-4 text-sm text-muted-foreground">Upload a report and click Analyze or Summarize to see the AI's interpretation here.</p>
        )}
        {loading && <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Working…</div>}
        {answer && (
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{answer}</div>
        )}
      </Card>
    </div>
  );
}
