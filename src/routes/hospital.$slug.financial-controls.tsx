import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  submitWhatsAppCommand, listWhatsAppCommands, applyWhatsAppCommand, listFinancialAudit,
} from "@/lib/whatsapp-commands.functions";
import { MessageSquare, ScrollText } from "lucide-react";

export const Route = createFileRoute("/hospital/$slug/financial-controls")({
  component: FinancialControlsPage,
});

function FinancialControlsPage() {
  const { slug } = useParams({ from: "/hospital/$slug/financial-controls" });
  const qc = useQueryClient();
  const submitFn = useServerFn(submitWhatsAppCommand);
  const listFn = useServerFn(listWhatsAppCommands);
  const applyFn = useServerFn(applyWhatsAppCommand);
  const auditFn = useServerFn(listFinancialAudit);

  const [cmd, setCmd] = useState("");

  const { data: cmds } = useQuery({
    queryKey: ["wa-cmds", slug],
    queryFn: () => listFn({ data: { slug } }),
  });
  const { data: audit } = useQuery({
    queryKey: ["fin-audit", slug],
    queryFn: () => auditFn({ data: { slug, limit: 50 } }),
  });

  useEffect(() => {
    const ch = supabase.channel(`wa-cmds-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_commands" },
        () => {
          qc.invalidateQueries({ queryKey: ["wa-cmds", slug] });
          qc.invalidateQueries({ queryKey: ["fin-audit", slug] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [slug, qc]);

  const submitM = useMutation({
    mutationFn: () => submitFn({ data: { slug, command: cmd } }),
    onSuccess: () => { toast.success("Command queued for approval"); setCmd(""); qc.invalidateQueries({ queryKey: ["wa-cmds", slug] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const decide = useMutation({
    mutationFn: (v: { commandId: string; decision: "apply" | "reject" }) =>
      applyFn({ data: { slug, ...v } }),
    onSuccess: () => { toast.success("Done"); qc.invalidateQueries({ queryKey: ["wa-cmds", slug] }); qc.invalidateQueries({ queryKey: ["fin-audit", slug] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Financial Controls</h1>
        <p className="text-sm text-muted-foreground">Edit or delete financial records via WhatsApp-style commands. All changes require admin approval and are fully audited.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> New command</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label>Command</Label>
          <Textarea
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder={"EDIT payments 11111111-1111-1111-1111-111111111111 amount=500 method=cash\nDELETE lab_orders 22222222-2222-2222-2222-222222222222"}
            rows={3}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">EDIT &lt;table&gt; &lt;id&gt; field=value …</Badge>
            <Badge variant="outline">DELETE &lt;table&gt; &lt;id&gt;</Badge>
            <span>Tables: payments, lab_orders, pharmacy_sales, appointments</span>
          </div>
          <Button onClick={() => submitM.mutate()} disabled={submitM.isPending || !cmd.trim()}>
            {submitM.isPending ? "Submitting…" : "Submit command"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Command queue</CardTitle></CardHeader>
        <CardContent>
          {(cmds?.commands || []).length === 0 ?
            <p className="text-sm text-muted-foreground">No commands yet.</p> :
            <div className="space-y-2">
              {cmds!.commands.map((c: any) => (
                <div key={c.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs">{c.command_raw}</code>
                    <Badge variant={
                      c.status === "applied" ? "default" :
                      c.status === "rejected" || c.status === "failed" ? "destructive" : "secondary"
                    }>{c.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    By {c.sender_role || "?"} · {new Date(c.created_at).toLocaleString()}
                    {c.error_message && <span className="text-destructive"> · {c.error_message}</span>}
                  </div>
                  {c.status === "pending" && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => decide.mutate({ commandId: c.id, decision: "apply" })}>Apply</Button>
                      <Button size="sm" variant="outline" onClick={() => decide.mutate({ commandId: c.id, decision: "reject" })}>Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Financial audit log</CardTitle></CardHeader>
        <CardContent>
          {(audit?.entries || []).length === 0 ?
            <p className="text-sm text-muted-foreground">No audit entries yet.</p> :
            <div className="divide-y">
              {audit!.entries.map((e: any) => (
                <div key={e.id} className="py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{e.source}</Badge>
                    <span className="font-medium">{e.action}</span>
                    <span className="text-muted-foreground">{e.table_name}</span>
                    <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  {e.reason && <div className="text-xs text-muted-foreground">{e.reason}</div>}
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
