import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Eye, FileCode2, Copy, Check, Archive } from "lucide-react";
import { toast } from "sonner";
import { migrationFiles, type MigrationFile } from "@/lib/migrations";

export const Route = createFileRoute("/master_admin/migrations")({
  component: MigrationsPage,
});

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function MigrationsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MigrationFile | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return migrationFiles;
    return migrationFiles.filter(
      (m) => m.filename.toLowerCase().includes(q) || m.sql.toLowerCase().includes(q),
    );
  }, [query]);

  const totalBytes = useMemo(
    () => migrationFiles.reduce((sum, m) => sum + m.bytes, 0),
    [],
  );

  const downloadAll = () => {
    const combined = migrationFiles
      .map(
        (m) =>
          `-- ===== ${m.filename} =====\n-- version: ${m.version}\n\n${m.sql.trim()}\n`,
      )
      .join("\n\n");
    downloadText("all_migrations.sql", combined, "application/sql");
    toast.success(`Downloaded ${migrationFiles.length} migrations`);
  };

  const copySql = async (sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Database Migrations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {migrationFiles.length} files · {formatBytes(totalBytes)} total. View, copy, or
            download the raw SQL for any migration.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Search filename or SQL…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-72"
          />
          <Button onClick={downloadAll} variant="outline">
            <Archive className="mr-2 h-4 w-4" />
            Download all
          </Button>
        </div>
      </div>

      <Card className="divide-y">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No migrations match “{query}”.
          </div>
        ) : (
          filtered.map((m) => (
            <div
              key={m.filename}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-md bg-primary-soft p-2 text-primary">
                  <FileCode2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{m.filename}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="font-mono">
                      {m.version}
                    </Badge>
                    <span>{formatBytes(m.bytes)}</span>
                    <span>{m.sql.split("\n").length} lines</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(m)}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadText(m.filename, m.sql, "application/sql")}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{selected?.filename}</DialogTitle>
          </DialogHeader>
          {selected && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="font-mono">
                  {selected.version}
                </Badge>
                <span>{formatBytes(selected.bytes)}</span>
                <span>{selected.sql.split("\n").length} lines</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copySql(selected.sql)}>
                    {copied ? (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy SQL"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadText(selected.filename, selected.sql, "application/sql")
                    }
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[60vh] rounded-md border bg-muted/30">
                <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
                  {selected.sql}
                </pre>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
