import { createFileRoute } from "@tanstack/react-router";
import { ModulePage, NewBtn, StatCard, StatusBadge } from "@/components/module-page";
import { Card } from "@/components/ui/card";
import { invoices } from "@/lib/mock-data";

export const Route = createFileRoute("/hospital/$slug/billing")({
  head: () => ({ meta: [{ title: "Billing — MediFlow AI" }] }),
  component: () => {
    const total = invoices.reduce((s,i)=>s+i.amount,0); const paid = invoices.reduce((s,i)=>s+i.paid,0);
    return (
      <ModulePage title="Billing & Invoices" subtitle="Patient billing · receivables" actions={<NewBtn label="New invoice" />}>
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Billed" value={`$${total.toLocaleString()}`} />
          <StatCard label="Collected" value={`$${paid.toLocaleString()}`} tone="success" />
          <StatCard label="Outstanding" value={`$${(total-paid).toLocaleString()}`} tone="warning" />
          <StatCard label="Overdue" value={String(invoices.filter(i=>i.status==="Overdue").length)} tone="destructive" />
        </div>
        <Card className="overflow-hidden"><table className="w-full text-sm"><thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Patient</th>
            <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Paid</th><th className="px-4 py-3 font-medium">Status</th></tr></thead>
          <tbody>{invoices.map(i=>(
            <tr key={i.id} className="border-b last:border-0 hover:bg-secondary/40">
              <td className="px-4 py-3 font-mono text-xs">{i.id}</td>
              <td className="px-4 py-3 font-medium">{i.patient}</td>
              <td className="px-4 py-3 text-muted-foreground">{i.date}</td>
              <td className="px-4 py-3">${i.amount}</td>
              <td className="px-4 py-3">${i.paid}</td>
              <td className="px-4 py-3"><StatusBadge status={i.status}
                tone={i.status==="Paid"?"ok":i.status==="Overdue"?"danger":i.status==="Partial"?"warn":"info"} /></td>
            </tr>))}</tbody></table></Card>
      </ModulePage>
    );
  },
});
