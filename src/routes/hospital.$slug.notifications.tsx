import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listMyNotifications, markNotificationRead } from "@/lib/notifications.functions";
import { Bell, CheckCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/hospital/$slug/notifications")({
  head: () => ({ meta: [{ title: "Notifications — MediFlow AI" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const list = useServerFn(listMyNotifications);
  const mark = useServerFn(markNotificationRead);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => list({ data: { limit: 50 } }) });
  const markAll = useMutation({
    mutationFn: () => mark({ data: { all: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const items = q.data?.items ?? [];

  return (
    <>
      <AppTopbar
        title="Notifications"
        subtitle="Latest alerts and workflow updates"
        right={<Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={!items.length || markAll.isPending}><CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read</Button>}
      />
      <div className="p-6">
        <Card className="p-0">
          {q.isLoading && <div className="flex items-center justify-center p-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>}
          {q.error && <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>}
          {q.data && items.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground"><Bell className="mx-auto mb-3 h-8 w-8" /> No notifications yet.</div>}
          <div className="divide-y">
            {items.map((n: any) => (
              <div key={n.id} className="flex items-start justify-between gap-4 p-4 text-sm">
                <div>
                  <p className="font-semibold">{n.title}</p>
                  {n.body && <p className="mt-1 text-muted-foreground">{n.body}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
                <Badge variant={n.read_at ? "outline" : "default"}>{n.read_at ? "Read" : "New"}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}