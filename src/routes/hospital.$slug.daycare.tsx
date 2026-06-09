import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, NewBtn, StatCard } from "@/components/module-page";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/hospital/$slug/daycare")({
  head: () => ({ meta: [{ title: "Day Care — MediFlow AI" }] }),
  component: () => (
    <ModulePage title="Day Care" subtitle="Short-stay procedures & infusions" actions={<NewBtn label="New session" />}>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active sessions" value="8" tone="info" />
        <StatCard label="Completed today" value="14" tone="success" />
        <StatCard label="Avg duration" value="2h 40m" />
      </div>
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Day-care scheduling, infusion tracking, and recovery notes appear here. Connect to the live database to start scheduling.
      </Card>
    </ModulePage>
  ),
});
