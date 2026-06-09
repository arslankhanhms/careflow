import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { hospitals, platformGrowth } from "@/lib/mock-data";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";

export const Route = createFileRoute("/master_admin/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const planMix = ["Starter", "Pro", "Enterprise"].map((p) => ({
    plan: p,
    hospitals: hospitals.filter((h) => h.plan === p).length,
  }));

  return (
    <>
      <AppTopbar title="Platform analytics" subtitle="MRR, patients, plan mix" />
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Patients vs hospitals</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={platformGrowth} margin={{ left: -10, right: 10 }}>
                <CartesianGrid stroke="oklch(0.92 0.008 20)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="patients" stroke="oklch(0.55 0.19 14)" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="hospitals" stroke="oklch(0.62 0.13 240)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Plan mix</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={planMix} margin={{ left: -10, right: 10 }}>
                <CartesianGrid stroke="oklch(0.92 0.008 20)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="plan" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="hospitals" fill="oklch(0.55 0.19 14)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
