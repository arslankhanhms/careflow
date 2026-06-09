import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { listHospitalContacts, getConversation, sendMessage } from "@/lib/messages.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, Send, Check, CheckCheck, MessageSquare, Paperclip, X as XIcon, FileText, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Contact = {
  userId: string; name: string; email?: string; role: string; specialization?: string;
  department?: string; avatar: string | null; lastMessage: string | null; lastAt: string | null; unread: number;
};
type Msg = {
  id: string; sender_id: string; recipient_id: string; body: string | null;
  attachment_url?: string | null; created_at: string; delivered_at: string | null; read_at: string | null;
};

export function MessagesInbox({ slug }: { slug: string }) {
  const { user } = useAuth();
  const fnContacts = useServerFn(listHospitalContacts);
  const fnConv = useServerFn(getConversation);
  const fnSend = useServerFn(sendMessage);

  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingConv, setLoadingConv] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const active = contacts.find((c) => c.userId === activeId) ?? null;

  const refreshContacts = async () => {
    try {
      const res = await fnContacts({ data: { hospitalSlug: slug } });
      setHospitalId(res.hospitalId);
      setContacts(res.contacts as Contact[]);
    } catch (e: any) { toast.error(e?.message || "Failed to load contacts"); }
  };

  useEffect(() => { setLoadingList(true); refreshContacts().finally(() => setLoadingList(false)); }, [slug]);

  useEffect(() => {
    if (!activeId || !hospitalId) return;
    setLoadingConv(true);
    fnConv({ data: { hospitalId, otherUserId: activeId } })
      .then((r) => {
        setMessages(r.messages as Msg[]);
        setContacts((prev) => prev.map((c) => c.userId === activeId ? { ...c, unread: 0 } : c));
      })
      .catch((e: any) => toast.error(e?.message || "Failed to load chat"))
      .finally(() => setLoadingConv(false));
  }, [activeId, hospitalId]);

  useEffect(() => {
    if (!user || !hospitalId) return;
    const channel = supabase
      .channel(`messages-${hospitalId}-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `hospital_id=eq.${hospitalId}` }, (payload: any) => {
        const m = payload.new as Msg;
        if (m.sender_id !== user.id && m.recipient_id !== user.id) return;
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (otherId === activeId) {
          setMessages((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
        } else if (m.recipient_id === user.id) {
          setContacts((prev) => prev.map((c) => c.userId === m.sender_id ? { ...c, unread: c.unread + 1, lastMessage: m.body, lastAt: m.created_at } : c));
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `hospital_id=eq.${hospitalId}` }, (payload: any) => {
        const m = payload.new as Msg;
        setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, ...m } : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, hospitalId, activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const chatList = useMemo(() => {
    return contacts
      .filter((c) => c.lastAt || c.userId === activeId)
      .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  }, [contacts, activeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chatList;
    return chatList.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.role ?? "").toLowerCase().includes(q) ||
      (c.specialization ?? "").toLowerCase().includes(q) ||
      (c.department ?? "").toLowerCase().includes(q),
    );
  }, [chatList, search]);

  const newChatList = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase();
    const base = contacts.filter((c) => !c.lastAt);
    if (!q) return base;
    return base.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.role ?? "").toLowerCase().includes(q) ||
      (c.specialization ?? "").toLowerCase().includes(q) ||
      (c.department ?? "").toLowerCase().includes(q),
    );
  }, [contacts, newChatQuery]);

  const send = async () => {
    if ((!draft.trim() && !attachment) || !activeId || !hospitalId || !user) return;
    setSending(true);
    const body = draft.trim();
    const file = attachment;
    setDraft("");
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";
    try {
      let attachmentUrl: string | undefined;
      if (file) {
        setUploading(true);
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${user.id}/${hospitalId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("message-attachments")
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data: signed, error: sErr } = await supabase.storage
          .from("message-attachments")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (sErr || !signed?.signedUrl) throw new Error(sErr?.message || "Failed to sign URL");
        attachmentUrl = signed.signedUrl;
        setUploading(false);
      }
      const r = await fnSend({ data: { hospitalId, recipientId: activeId, body, attachmentUrl } });
      setMessages((prev) => prev.find((x) => x.id === r.message.id) ? prev : [...prev, r.message as Msg]);
      setContacts((prev) => prev.map((c) => c.userId === activeId ? { ...c, lastMessage: body || "📎 Attachment", lastAt: r.message.created_at } : c));
    } catch (e: any) { toast.error(e?.message || "Failed to send"); setDraft(body); setAttachment(file); }
    finally { setSending(false); setUploading(false); }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-80 flex-col border-r border-border/60 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="text-lg font-semibold">Chats</h2>
              <p className="text-xs text-muted-foreground">Internal staff messages</p>
            </div>
            <Button size="icon" variant="default" className="h-9 w-9 rounded-full" onClick={() => { setNewChatQuery(""); setNewChatOpen(true); }} aria-label="New chat">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="border-b border-border/60 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" className="pl-8" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No chats yet.<br />Tap <Plus className="inline h-3 w-3" /> to start one.
              </div>
            ) : filtered.map((c) => (
              <button key={c.userId} onClick={() => setActiveId(c.userId)}
                className={`flex w-full items-center gap-3 border-b border-border/40 px-3 py-3 text-left transition hover:bg-accent ${activeId === c.userId ? "bg-accent" : ""}`}>
                <Avatar name={c.name} src={c.avatar} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    {c.lastAt && <span className="shrink-0 text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(c.lastAt), { addSuffix: false })}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">{c.lastMessage ?? <span className="italic capitalize">{c.role.replace("_"," ")}</span>}</p>
                    {c.unread > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{c.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex flex-1 flex-col">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-secondary/30 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">Select a contact to start chatting</p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-border/60 bg-card px-4 py-3">
                <Avatar name={active.name} src={active.avatar} />
                <div>
                  <p className="text-sm font-semibold">{active.name}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{active.role.replace("_"," ")}{active.specialization ? ` · ${active.specialization}` : ""}</p>
                </div>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto bg-[oklch(0.97_0.005_240)] p-4">
                {loadingConv ? (
                  <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground">No messages yet — say hello!</p>
                ) : messages.map((m) => {
                  const mine = m.sender_id === user?.id;
                  const isImage = m.attachment_url ? /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(m.attachment_url) : false;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card"}`}>
                        {m.attachment_url && (
                          isImage ? (
                            <a href={m.attachment_url} target="_blank" rel="noreferrer">
                              <img src={m.attachment_url} alt="attachment" className="mb-1 max-h-60 rounded-lg object-cover" />
                            </a>
                          ) : (
                            <a href={m.attachment_url} target="_blank" rel="noreferrer"
                              className={`mb-1 flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${mine ? "border-primary-foreground/30 bg-primary-foreground/10" : "border-border bg-secondary/40"}`}>
                              <FileText className="h-4 w-4 shrink-0" />
                              <span className="truncate">Attachment</span>
                            </a>
                          )
                        )}
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {mine && (m.read_at ? <CheckCheck className="h-3 w-3 text-blue-200" /> : m.delivered_at ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <footer className="border-t border-border/60 bg-card p-3">
                {attachment && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-2 py-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate flex-1">{attachment.name}</span>
                    <span className="text-muted-foreground">{(attachment.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => { setAttachment(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-muted-foreground hover:text-foreground"><XIcon className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB"); e.target.value = ""; return; }
                      setAttachment(f);
                    }}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={sending} className="h-10 w-10 shrink-0">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Type a message…"
                    rows={1}
                    className="flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button onClick={send} disabled={sending || (!draft.trim() && !attachment)} size="icon" className="h-10 w-10 rounded-full bg-primary text-primary-foreground hover:opacity-95">
                    {sending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Start new chat</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={newChatQuery} onChange={(e) => setNewChatQuery(e.target.value)} placeholder="Search staff…" className="pl-8" autoFocus />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {newChatList.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                {contacts.filter((c) => !c.lastAt).length === 0 ? "You already have a chat with every staff member." : "No staff match your search."}
              </p>
            ) : newChatList.map((c) => (
              <button key={c.userId} onClick={() => { setActiveId(c.userId); setNewChatOpen(false); }}
                className="flex w-full items-center gap-3 border-b border-border/40 px-2 py-2.5 text-left last:border-0 hover:bg-accent">
                <Avatar name={c.name} src={c.avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground capitalize">
                    {c.role.replace("_"," ")}{c.specialization ? ` · ${c.specialization}` : ""}{c.department ? ` · ${c.department}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const initials = name.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  if (src) return <img src={src} alt={name} className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initials}</div>;
}
