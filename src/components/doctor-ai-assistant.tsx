import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Sparkles, X, Send, Loader2, Trash2 } from "lucide-react";
import { askDoctorAssistant } from "@/lib/ai-assistants.functions";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
const KEY = "mediflow-doctor-ai-history";

export function DoctorAiAssistant() {
  const ask = useServerFn(askDoctorAssistant);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(history.slice(-20))); } catch {}
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

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-brand p-0 text-primary-foreground shadow-elegant hover:opacity-95"
        aria-label="Open MediFlow AI assistant"
      >
        <Sparkles className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 z-50 flex h-[min(560px,80vh)] w-[min(380px,90vw)] flex-col overflow-hidden shadow-elegant">
      <div className="flex items-center justify-between border-b bg-gradient-brand px-3 py-2 text-primary-foreground">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <p className="text-sm font-semibold">MediFlow Clinical AI</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary-foreground hover:bg-white/20"
            onClick={() => { setHistory([]); try { localStorage.removeItem(KEY); } catch {} }}
            aria-label="Clear chat"><Trash2 className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary-foreground hover:bg-white/20"
            onClick={() => setOpen(false)} aria-label="Close"><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {history.length === 0 && (
          <div className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground">
            Ask about diseases, treatment protocols, drug doses, or interactions.
            Example: <span className="italic">"First-line treatment for community-acquired pneumonia in adults"</span>.
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}>{m.content}</div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</div>}
      </div>

      <div className="border-t p-2">
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask a clinical question…" disabled={busy} />
          <Button onClick={send} disabled={busy || !q.trim()} className="bg-gradient-brand text-primary-foreground hover:opacity-95">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Reference only — final judgment is the treating physician's.</p>
      </div>
    </Card>
  );
}
