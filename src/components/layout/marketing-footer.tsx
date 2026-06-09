import { Brand } from "@/components/brand";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/30">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <Brand />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            AI-powered hospital & polyclinic SaaS. Built for clinicians, designed for scale.
          </p>
        </div>
        <FooterCol title="Product" items={["Features", "Modules", "AI assistants", "Pricing", "Changelog"]} />
        <FooterCol title="Solutions" items={["Hospitals", "Polyclinics", "Day care", "Diagnostic labs", "Pharmacies"]} />
        <FooterCol title="Company" items={["About", "Security", "HIPAA", "Contact", "Status"]} />
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-4 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} MediFlow AI. All rights reserved.</p>
          <p>Built with care for healthcare teams worldwide.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {items.map((i) => <li key={i} className="hover:text-foreground transition cursor-pointer">{i}</li>)}
      </ul>
    </div>
  );
}
