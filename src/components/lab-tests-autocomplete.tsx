import { useState, useMemo, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listMyHospitalLabServices } from "@/lib/lab-services.functions";
import { X, FlaskConical, Plus } from "lucide-react";

type Svc = { id: string; name: string; category: string | null; price?: number | null };

export function LabTestsAutocomplete({
  values,
  onChange,
  label = "Lab tests advised",
  placeholder = "Type to search (e.g. CBC, LFT, X-Ray)…",
}: {
  values: string[];
  onChange: (next: string[]) => void;
  label?: string;
  placeholder?: string;
}) {
  const fn = useServerFn(listMyHospitalLabServices);
  const q = useQuery({ queryKey: ["my-lab-services"], queryFn: () => fn() });
  const services: Svc[] = (q.data as any) ?? [];
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const suggestions = useMemo(() => {
    const t = text.trim().toLowerCase();
    const taken = new Set(values.map((v) => v.toLowerCase()));
    let list = services.filter((s) => !taken.has(s.name.toLowerCase()));
    if (t) list = list.filter((s) => s.name.toLowerCase().includes(t) || (s.category ?? "").toLowerCase().includes(t));
    return list.slice(0, 8);
  }, [text, services, values]);

  const add = (name: string) => {
    const v = name.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v]);
    setText("");
  };
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  const exactMatchMissing = text.trim().length > 0 &&
    !services.some((s) => s.name.toLowerCase() === text.trim().toLowerCase());

  return (
    <div ref={boxRef} className="relative">
      <Label className="flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" /> {label}</Label>
      <div className="mt-1 flex flex-wrap gap-1 rounded-md border bg-background p-1.5">
        {values.map((v, i) => (
          <Badge key={`${v}-${i}`} variant="secondary" className="gap-1 pr-1 text-xs">
            {v}
            <button type="button" onClick={() => remove(i)} className="rounded hover:bg-destructive/20">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={text}
          onChange={(e) => { setText(e.target.value); setFocused(true); }}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(suggestions[0]?.name || text); }
            else if (e.key === "Backspace" && !text && values.length) remove(values.length - 1);
          }}
          placeholder={values.length === 0 ? placeholder : ""}
          className="h-7 min-w-[160px] flex-1 border-0 px-2 shadow-none focus-visible:ring-0"
        />
      </div>

      {focused && (suggestions.length > 0 || exactMatchMissing) && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => add(s.name)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
            >
              <span><span className="font-medium">{s.name}</span>
                {s.category && <span className="ml-2 text-[10px] text-muted-foreground">{s.category}</span>}
              </span>
              {s.price != null && Number(s.price) > 0 && (
                <span className="text-[11px] text-muted-foreground">Rs {Number(s.price).toLocaleString()}</span>
              )}
            </button>
          ))}
          {exactMatchMissing && (
            <button
              type="button"
              onClick={() => add(text)}
              className="mt-1 flex w-full items-center gap-1 rounded border-t px-2 py-1.5 text-left text-xs hover:bg-secondary"
            >
              <Plus className="h-3 w-3" /> Add custom: <span className="font-medium">"{text.trim()}"</span>
            </button>
          )}
        </div>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">
        Tests advised here auto-create a lab order and notify lab staff. Receptionist collects fee, then results flow back to you.
      </p>
    </div>
  );
}
