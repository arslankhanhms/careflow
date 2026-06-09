import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCheck, Check, CheckCheck as DeliveredIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listMyNotifications, markNotificationRead } from "@/lib/notifications.functions";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: any;
  read_at: string | null;
  delivered_at: string | null;
  created_at: string;
  hospital_id: string | null;
};

function safeRelativeTime(value: string | null | undefined) {
  if (!value) return "Just now";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "Just now";
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "Just now";
  }
}

class NotificationsBellErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Notifications bell failed", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function StatusTicks({ n }: { n: Notif }) {
  // Sent (single check, muted) → Delivered (double, muted) → Read (double, primary)
  if (n.read_at) return <DeliveredIcon className="h-3 w-3 text-primary" aria-label="Read" />;
  if (n.delivered_at)
    return <DeliveredIcon className="h-3 w-3 text-muted-foreground" aria-label="Delivered" />;
  return <Check className="h-3 w-3 text-muted-foreground" aria-label="Sent" />;
}

export function NotificationsBell() {
  return (
    <NotificationsBellErrorBoundary>
      <NotificationsBellInner />
    </NotificationsBellErrorBoundary>
  );
}

function NotificationsBellInner() {
  const list = useServerFn(listMyNotifications);
  const mark = useServerFn(markNotificationRead);
  const listRef = useRef(list);
  const markRef = useRef(mark);
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current = list;
  }, [list]);
  useEffect(() => {
    markRef.current = mark;
  }, [mark]);

  const loadInitial = useCallback(async () => {
    try {
      const r: any = await listRef.current({ data: {} });
      setItems(Array.isArray(r?.items) ? r.items : []);
      setUnread(Number(r?.unread ?? 0));
      setCursor(r?.nextCursor ?? null);
      setHasMore(Boolean(r?.hasMore));
    } catch {
      /* ignore */
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r: any = await listRef.current({ data: { before: cursor } });
      setItems((prev) => [...prev, ...(Array.isArray(r?.items) ? r.items : [])]);
      setCursor(r?.nextCursor ?? null);
      setHasMore(Boolean(r?.hasMore));
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [list, cursor, hasMore, loadingMore]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Realtime: subscribe to my notifications
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as Notif;
          setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
          if (!n.read_at) setUnread((u) => u + 1);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as Notif;
          setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, ...n } : p)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) loadMore();
  };

  const onMarkAll = async () => {
    await markRef.current({ data: { all: true } });
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((p) => ({ ...p, read_at: p.read_at ?? now, delivered_at: p.delivered_at ?? now })),
    );
    setUnread(0);
  };
  const onOpen = (n: Notif) => {
    if (n.read_at) return;
    markRef.current({ data: { id: n.id } });
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((p) =>
        p.id === n.id ? { ...p, read_at: now, delivered_at: p.delivered_at ?? now } : p,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Notifications"
          className="relative h-12 w-12 rounded-full border border-border/60 bg-background shadow-sm transition-all duration-200 hover:scale-105 hover:bg-secondary hover:shadow-md"
        >
          <Bell className="h-6 w-6" strokeWidth={2.2} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground ring-2 ring-background animate-in zoom-in">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 w-5 animate-ping rounded-full bg-destructive/60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b p-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onMarkAll}>
              <CheckCheck className="mr-1 h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <div ref={scrollRef} onScroll={onScroll} className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">No notifications yet</p>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => onOpen(n)}
              className={`block w-full border-b p-3 text-left text-xs hover:bg-secondary/40 ${!n.read_at ? "bg-primary/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{n.title}</p>
                <StatusTicks n={n} />
              </div>
              {n.body && <p className="mt-0.5 text-muted-foreground">{n.body}</p>}
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                  {safeRelativeTime(n.created_at)}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {n.read_at ? "Read" : n.delivered_at ? "Delivered" : "Sent"}
                </p>
              </div>
            </button>
          ))}
          {hasMore && (
            <div className="p-2 text-center">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs w-full"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
