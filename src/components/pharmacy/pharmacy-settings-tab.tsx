import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { getPharmacySettings, upsertPharmacySettings } from "@/lib/pharmacy.functions";

type Form = {
  default_tax_percent: number;
  default_discount_percent: number;
  default_discount_type: "percent" | "fixed";
  invoice_prefix: string;
  invoice_padding: number;
  low_stock_threshold: number;
  expiry_warning_days: number;
  currency: string;
  receipt_footer: string;
};

const EMPTY: Form = {
  default_tax_percent: 0,
  default_discount_percent: 0,
  default_discount_type: "percent",
  invoice_prefix: "INV",
  invoice_padding: 6,
  low_stock_threshold: 10,
  expiry_warning_days: 30,
  currency: "PKR",
  receipt_footer: "",
};

export function PharmacySettingsTab({ slug, enabled }: { slug: string; enabled: boolean }) {
  const get = useServerFn(getPharmacySettings);
  const save = useServerFn(upsertPharmacySettings);
  const qc = useQueryClient();
  const [v, setV] = useState<Form>(EMPTY);

  const q = useQuery({
    queryKey: ["pharm-settings", slug],
    queryFn: () => get({ data: { slug } }),
    enabled,
  });

  useEffect(() => {
    const s = q.data?.settings;
    if (!s) return;
    setV({
      default_tax_percent: Number(s.default_tax_percent ?? 0),
      default_discount_percent: Number(s.default_discount_percent ?? 0),
      default_discount_type: (s.default_discount_type ?? "percent") as "percent" | "fixed",
      invoice_prefix: s.invoice_prefix ?? "INV",
      invoice_padding: Number(s.invoice_padding ?? 6),
      low_stock_threshold: Number(s.low_stock_threshold ?? 10),
      expiry_warning_days: Number(s.expiry_warning_days ?? 30),
      currency: s.currency ?? "PKR",
      receipt_footer: s.receipt_footer ?? "",
    });
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () => save({ data: { slug, ...v } }),
    onSuccess: () => {
      toast.success("Pharmacy settings saved");
      qc.invalidateQueries({ queryKey: ["pharm-settings", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  if (!enabled) {
    return <Card className="p-6 text-sm text-muted-foreground">Sign in to manage pharmacy settings.</Card>;
  }
  if (q.isLoading) {
    return (
      <Card className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading settings…
      </Card>
    );
  }

  const samplePreview = `${v.invoice_prefix}-${new Date().getFullYear()}-${String(1).padStart(v.invoice_padding, "0")}`;

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Taxes & Discounts</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Default tax %</Label>
            <Input type="number" min={0} max={100} step="0.01" value={v.default_tax_percent}
              onChange={(e) => setV({ ...v, default_tax_percent: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-muted-foreground">Applied to new POS sales by default.</p>
          </div>
          <div>
            <Label>Default discount</Label>
            <Input type="number" min={0} max={100} step="0.01" value={v.default_discount_percent}
              onChange={(e) => setV({ ...v, default_discount_percent: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Discount type</Label>
            <Select value={v.default_discount_type}
              onValueChange={(val) => setV({ ...v, default_discount_type: val as "percent" | "fixed" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent (%)</SelectItem>
                <SelectItem value="fixed">Fixed amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Invoice numbering</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Prefix</Label>
            <Input value={v.invoice_prefix}
              onChange={(e) => setV({ ...v, invoice_prefix: e.target.value })}
              placeholder="INV" />
          </div>
          <div>
            <Label>Number padding</Label>
            <Input type="number" min={3} max={10} value={v.invoice_padding}
              onChange={(e) => setV({ ...v, invoice_padding: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={v.currency}
              onChange={(e) => setV({ ...v, currency: e.target.value })} placeholder="PKR" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Example: <span className="font-mono">{samplePreview}</span>
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Stock & expiry thresholds</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Low-stock threshold (units)</Label>
            <Input type="number" min={0} value={v.low_stock_threshold}
              onChange={(e) => setV({ ...v, low_stock_threshold: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-muted-foreground">Default reorder level for new medicines.</p>
          </div>
          <div>
            <Label>Expiry warning (days)</Label>
            <Input type="number" min={1} max={365} value={v.expiry_warning_days}
              onChange={(e) => setV({ ...v, expiry_warning_days: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-muted-foreground">Items expiring within this window are flagged.</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Receipt footer</h2>
        <Textarea
          rows={3}
          value={v.receipt_footer}
          onChange={(e) => setV({ ...v, receipt_footer: e.target.value })}
          placeholder="Thank you for your purchase. No returns without receipt."
        />
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save settings
        </Button>
      </div>
    </div>
  );
}
