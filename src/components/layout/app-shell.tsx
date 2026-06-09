import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";


export type SidebarItem = {
  label: string;
  to: string;
  params?: Record<string, string>;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
};

export type SidebarSection = { title?: string; items: SidebarItem[] };

function useUnreadMessageCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user?.id) { setCount(0); return; }
    let cancelled = false;
    const load = async () => {
      const { count: c } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (!cancelled) setCount(c ?? 0);
    };
    load();
    const ch = supabase
      .channel(`unread-msgs:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id]);
  return count;
}

function useUnreadReportCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user?.id) { setCount(0); return; }
    let cancelled = false;
    const load = async () => {
      const { count: c } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null)
        .in("type", ["patient.report_uploaded", "patient.report_analyzed", "lab_result"]);
      if (!cancelled) setCount(c ?? 0);
    };
    load();
    const ch = supabase
      .channel(`unread-reports:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id]);
  return count;
}

function SidebarNav({
  sections,
  footer,
  onNavigate,
  collapsed = false,
}: {
  sections: SidebarSection[];
  footer?: ReactNode;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { pathname } = useLocation();
  const unreadMessages = useUnreadMessageCount();
  const unreadReports = useUnreadReportCount();
  const decoratedSections = sections.map((s) => ({
    ...s,
    items: s.items.map((it) =>
      it.to.includes("/messages") && unreadMessages > 0
        ? { ...it, badge: unreadMessages > 99 ? "99+" : String(unreadMessages) }
        : (it.to.includes("/reports") || it.label.toLowerCase().includes("report")) && unreadReports > 0
          ? { ...it, badge: unreadReports > 99 ? "99+" : String(unreadReports) }
        : it,
    ),
  }));
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col bg-sidebar">
        <div className={cn("flex h-16 shrink-0 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-5")}>
          <Link to="/" onClick={onNavigate} className="flex items-center">
            {collapsed ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground font-bold">
                M
              </div>
            ) : (
              <Brand />
            )}
          </Link>
        </div>
        <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          {decoratedSections.map((section, i) => (
            <div key={i} className={cn(i > 0 && "mt-5")}>
              {section.title && !collapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/60">
                  {section.title}
                </p>
              )}
              {section.title && collapsed && i > 0 && (
                <div className="my-3 h-px bg-sidebar-border/60" />
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  let href = item.to;
                  if (item.params) {
                    for (const [k, v] of Object.entries(item.params)) href = href.replace(`$${k}`, v);
                  }
                  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                  const link = (
                    <Link
                      to={item.to as never}
                      params={item.params as never}
                      onClick={onNavigate}
                      className={cn(
                        "group relative flex items-center rounded-lg text-sm font-medium transition-all",
                        collapsed ? "h-10 w-10 justify-center" : "gap-2.5 px-3 py-2",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gradient-brand" />
                      )}
                      <Icon
                        className={cn(
                          "shrink-0 transition-colors",
                          collapsed ? "h-5 w-5" : "h-4 w-4",
                          active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/80 group-hover:text-sidebar-foreground",
                        )}
                      />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                  return (
                    <li key={item.label}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right" className="flex items-center gap-1.5">
                            {item.label}
                            {item.badge && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                {item.badge}
                              </span>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      ) : link}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        {footer && !collapsed && <div className="shrink-0 border-t border-sidebar-border p-3">{footer}</div>}
      </div>
    </TooltipProvider>
  );
}

// Footer stays pinned at the bottom while long menus scroll independently.

export function AppSidebar({
  sections,
  footer,
}: {
  sections: SidebarSection[];
  footer?: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border transition-[width] duration-200 ease-out md:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <SidebarNav sections={sections} footer={footer} collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-background text-muted-foreground shadow-sm transition hover:text-foreground hover:shadow"
        >
          {collapsed ? <ChevronsRight className="h-3 w-3" /> : <ChevronsLeft className="h-3 w-3" />}
        </button>
      </aside>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-sidebar-border bg-sidebar/95 px-3 backdrop-blur">
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <Link to="/">
          <Brand />
        </Link>
        <div className="w-9" />
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-sidebar-border bg-sidebar shadow-2xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
            <SidebarNav sections={sections} footer={footer} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

export function AppTopbar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {right}
          {user && <NotificationsBell />}
        </div>
      </div>
    </div>
  );
}
