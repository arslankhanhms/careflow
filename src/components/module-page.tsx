import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppTopbar } from "@/components/layout/app-shell";
import { Search, Plus, Filter, Download } from "lucide-react";
import type { ReactNode } from "react";

export function ModulePage({
  title, subtitle, children, actions, search = true,
}: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode; search?: boolean }) {
  return (
    <>
      <AppTopbar title={title} subtitle={subtitle} right={
        <div className="flex gap-2">
          {actions}
          <Button size="sm" variant="outline"><Download className="mr-1.5 h-3.5 w-3.5" /> Export</Button>
        </div>
      } />
      <div className="space-y-4 p-6">
        {search && (
          <Card className="flex items-center gap-2 p-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search…" className="h-8 border-0 shadow-none focus-visible:ring-0" />
            <Button size="sm" variant="ghost"><Filter className="mr-1.5 h-3.5 w-3.5" /> Filters</Button>
          </Card>
        )}
        {children}
      </div>
    </>
  );
}

export function StatCard({ label, value, hint, tone = "default" }: {
  label: string; value: string; hint?: string; tone?: "default" | "success" | "warning" | "destructive" | "info";
}) {
  const toneCls = {
    default: "", success: "text-success",
    warning: "text-warning-foreground", destructive: "text-destructive", info: "text-info",
  }[tone];
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${toneCls}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function StatusBadge({ status, tone }: { status: string; tone: "ok" | "warn" | "danger" | "info" | "muted" }) {
  const cls = {
    ok: "border-success/30 bg-success/10 text-success",
    warn: "border-warning/40 bg-warning/10 text-warning-foreground",
    danger: "border-destructive/30 bg-destructive/10 text-destructive",
    info: "border-info/30 bg-info/10 text-info",
    muted: "border-border bg-secondary text-muted-foreground",
  }[tone];
  return <Badge variant="outline" className={cls}>{status}</Badge>;
}

export const NewBtn = ({ label = "New" }: { label?: string }) => (
  <Button size="sm" className="bg-gradient-brand text-primary-foreground hover:opacity-95">
    <Plus className="mr-1.5 h-3.5 w-3.5" /> {label}
  </Button>
);
