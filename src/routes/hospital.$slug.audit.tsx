import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { auditLog } from "@/lib/mock-data";

export const Route = createFileRoute("/hospital/$slug/audit")({
  head: () => ({ meta: [{ title: "Audit Log — MediFlow AI" }] }),
  component: () => (
    <ModulePage title="Audit Log" subtitle="Append-only · tenant-scoped">
      <Card className="overflow-hidden"><table className="w-full text-sm"><thead>
        <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-3 font-medium">Timestamp</th><th className="px-4 py-3 font-medium">Actor</th>
          <th className="px-4 py-3 font-medium">Action</th><th className="px-4 py-3 font-medium">Entity</th></tr></thead>
        <tbody>{auditLog.map((a,i)=>(
          <tr key={i} className="border-b last:border-0 hover:bg-secondary/40">
            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.ts}</td>
            <td className="px-4 py-3 font-medium">{a.actor}</td>
            <td className="px-4 py-3">{a.action}</td>
            <td className="px-4 py-3 font-mono text-xs">{a.entity}</td>
          </tr>))}</tbody></table></Card>
    </ModulePage>
  ),
});
