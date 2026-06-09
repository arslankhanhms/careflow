import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { plans } from "@/lib/mock-data";
import { Check } from "lucide-react";

export const Route = createFileRoute("/master_admin/plans")({ component: PlansPage });

function PlansPage() {
  return (
    <>
      <AppTopbar title="Subscription plans" subtitle="What hospitals see when they upgrade" />
      <div className="grid gap-6 p-6 md:grid-cols-3">
        {plans.map((p, i) => (
          <Card key={p.id} className={`relative p-6 ${i === 1 ? "border-primary shadow-elegant" : ""}`}>
            {i === 1 && (
              <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-soft">
                Most popular
              </span>
            )}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-2 text-3xl font-bold tracking-tight">${p.price}<span className="text-sm font-medium text-muted-foreground">/mo</span></p>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <Spec label="Users" v={p.users === -1 ? "Unlimited" : p.users.toString()} />
              <Spec label="Branches" v={p.branches === -1 ? "Unlimited" : p.branches.toString()} />
              <Spec label="AI credits/mo" v={p.ai.toLocaleString()} />
              <Spec label="Storage" v={p.storage} />
            </dl>
            <ul className="mt-6 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}</li>
              ))}
            </ul>
            <Button className={`mt-6 w-full ${i === 1 ? "bg-gradient-brand text-primary-foreground hover:opacity-95" : ""}`} variant={i === 1 ? "default" : "outline"}>
              Edit plan
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}

function Spec({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md bg-secondary/60 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{v}</p>
    </div>
  );
}
