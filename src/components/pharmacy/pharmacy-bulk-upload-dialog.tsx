import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Sparkles, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { bulkCreateMedicines, extractMedicinesFromImage } from "@/lib/pharmacy.functions";

type Row = {
  name: string;
  generic_name?: string | null;
  company?: string | null;
  batch_no?: string | null;
  expiry_date?: string | null;
  stock_qty: number;
  purchase_price: number;
  sale_price: number;
  min_stock_level: number;
  barcode?: string | null;
  unit: string;
};

function parseCSV(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const name = cols[idx("name")]?.trim();
    if (!name) continue;
    out.push({
      name,
      generic_name: cols[idx("generic_name")] || null,
      company: cols[idx("company")] || null,
      batch_no: cols[idx("batch_no")] || null,
      expiry_date: cols[idx("expiry_date")] || null,
      stock_qty: Number(cols[idx("stock_qty")] || 0),
      purchase_price: Number(cols[idx("purchase_price")] || 0),
      sale_price: Number(cols[idx("sale_price")] || 0),
      min_stock_level: Number(cols[idx("min_stock_level")] || 10),
      barcode: cols[idx("barcode")] || null,
      unit: (cols[idx("unit")] || "tablet").trim(),
    });
  }
  return out;
}
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Failed to read file"));
    r.readAsDataURL(f);
  });
}

export function PharmacyBulkUploadDialog({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const bulkFn = useServerFn(bulkCreateMedicines);
  const extractFn = useServerFn(extractMedicinesFromImage);
  const [rows, setRows] = useState<Row[]>([]);
  const [extracting, setExtracting] = useState(false);

  const importMut = useMutation({
    mutationFn: () => bulkFn({ data: { slug, rows: rows as any } }),
    onSuccess: (res) => {
      toast.success(`Imported ${res.inserted} medicines`);
      setRows([]);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["pharm-meds", slug] });
      qc.invalidateQueries({ queryKey: ["pharm-dash", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const onCsvFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCSV(text);
    if (!parsed.length) { toast.error("No rows found. Check the CSV header."); return; }
    setRows(parsed);
    toast.success(`Parsed ${parsed.length} rows`);
  };

  const onAiFile = async (file: File) => {
    if (file.size > 8_000_000) { toast.error("File too large (max 8 MB for AI)"); return; }
    try {
      setExtracting(true);
      const dataUrl = await fileToDataUrl(file);
      const res = await extractFn({ data: { slug, file_data_url: dataUrl, mime_type: file.type || "application/octet-stream" } });
      if (!res.medicines.length) { toast.error("AI did not detect any medicines."); return; }
      setRows(res.medicines as Row[]);
      toast.success(`AI extracted ${res.medicines.length} medicines — review then import`);
    } catch (e: any) {
      toast.error(e?.message || "AI extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const updateRow = (i: number, k: keyof Row, v: any) => {
    setRows((m) => m.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  };
  const removeRow = (i: number) => setRows((m) => m.filter((_, idx) => idx !== i));

  const downloadTemplate = () => {
    const header = "name,generic_name,company,batch_no,expiry_date,stock_qty,purchase_price,sale_price,min_stock_level,barcode,unit";
    const sample = "Panadol 500mg,Paracetamol,GSK,BATCH-001,2026-12-31,100,5,8,10,,tablet";
    const blob = new Blob([header + "\n" + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "medicines-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Bulk upload medicines</DialogTitle></DialogHeader>

        <Tabs defaultValue="ai" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai"><Sparkles className="mr-1.5 h-4 w-4" /> AI from PDF/photo</TabsTrigger>
            <TabsTrigger value="csv"><FileText className="mr-1.5 h-4 w-4" /> CSV / Excel</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Upload a photo or PDF of the medicine list. AI will read names, batch, expiry, prices, etc.
              Review the extracted table below before importing. Best results with clear photos / typed PDFs.
            </p>
            <div>
              <Label>Upload image or PDF</Label>
              <Input type="file" accept="image/*,application/pdf"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onAiFile(f); }}
                disabled={extracting} />
            </div>
            {extracting && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> AI is reading the document…
              </div>
            )}
          </TabsContent>

          <TabsContent value="csv" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Upload a CSV with columns: <code>name, generic_name, company, batch_no, expiry_date, stock_qty, purchase_price, sale_price, min_stock_level, barcode, unit</code>.
              For Excel, save as CSV first.
            </p>
            <div className="flex gap-2">
              <Input type="file" accept=".csv,text/csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsvFile(f); }} />
              <Button variant="outline" type="button" onClick={downloadTemplate}>Download template</Button>
            </div>
          </TabsContent>
        </Tabs>

        {rows.length > 0 && (
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b p-2">
              <p className="text-sm font-medium">{rows.length} medicines ready to import</p>
              <Button variant="ghost" size="sm" onClick={() => setRows([])}>Clear</Button>
            </div>
            <div className="max-h-[40vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    {["Name","Generic","Company","Batch","Expiry","Stock","Purchase","Sale","Unit",""].map((h) => (
                      <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1"><Input className="h-7" value={r.name} onChange={(e) => updateRow(i, "name", e.target.value)} /></td>
                      <td className="p-1"><Input className="h-7" value={r.generic_name ?? ""} onChange={(e) => updateRow(i, "generic_name", e.target.value || null)} /></td>
                      <td className="p-1"><Input className="h-7" value={r.company ?? ""} onChange={(e) => updateRow(i, "company", e.target.value || null)} /></td>
                      <td className="p-1"><Input className="h-7" value={r.batch_no ?? ""} onChange={(e) => updateRow(i, "batch_no", e.target.value || null)} /></td>
                      <td className="p-1"><Input className="h-7" type="date" value={r.expiry_date ?? ""} onChange={(e) => updateRow(i, "expiry_date", e.target.value || null)} /></td>
                      <td className="p-1"><Input className="h-7 w-16" type="number" value={r.stock_qty} onChange={(e) => updateRow(i, "stock_qty", Number(e.target.value))} /></td>
                      <td className="p-1"><Input className="h-7 w-20" type="number" step="0.01" value={r.purchase_price} onChange={(e) => updateRow(i, "purchase_price", Number(e.target.value))} /></td>
                      <td className="p-1"><Input className="h-7 w-20" type="number" step="0.01" value={r.sale_price} onChange={(e) => updateRow(i, "sale_price", Number(e.target.value))} /></td>
                      <td className="p-1"><Input className="h-7 w-20" value={r.unit} onChange={(e) => updateRow(i, "unit", e.target.value)} /></td>
                      <td className="p-1"><Button variant="ghost" size="sm" onClick={() => removeRow(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={rows.length === 0 || importMut.isPending} onClick={() => importMut.mutate()}>
            {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import {rows.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
