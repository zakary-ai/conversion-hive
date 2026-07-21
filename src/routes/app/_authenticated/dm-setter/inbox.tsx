import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { obListConversations, obGetConversation, obSendReply, obSetCategory, obQuickAction } from "@/lib/api/ob.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, XCircle, Inbox, MessageCircle, HelpCircle, AlertCircle, Calendar, Archive, Mail, Search, ArrowLeft, UserX, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const TABS = [
  { key: "needs_response", label: "Needs response", icon: Inbox },
  { key: "positive", label: "Positive", icon: MessageCircle },
  { key: "question", label: "Question", icon: HelpCircle },
  { key: "objection", label: "Objection", icon: AlertCircle },
  { key: "meeting_booked", label: "Meetings", icon: Calendar },
  { key: "other", label: "Other", icon: Archive },
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  uncategorized: "Uncategorized",
  positive: "Positive",
  question: "Question",
  objection: "Objection",
  info_requested: "Info requested",
  out_of_office: "Out of office",
  not_interested: "Not interested",
  wrong_person: "Wrong person",
  unsubscribe: "Unsubscribe",
  meeting_booked: "Meeting booked",
};

const listOpts = (tab: string) => queryOptions({
  queryKey: ["ob-convs", tab],
  queryFn: () => obListConversations({ data: { tab } }),
});

export const Route = createFileRoute("/app/_authenticated/dm-setter/inbox")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listOpts("needs_response")),
  component: InboxPage,
});

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function formatTimeShort(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function stripQuotedReply(html: string): { visible: string; quoted: string | null } {
  if (!html) return { visible: "", quoted: null };
  // Split on Gmail's quote container
  const idx = html.search(/<div[^>]*class="[^"]*gmail_quote[^"]*"/i);
  if (idx > 0) return { visible: html.slice(0, idx), quoted: html.slice(idx) };
  // Fallback: "On <date> ... wrote:"
  const m = html.match(/<[^>]+>On\s+[^<]{5,80}wrote:<\/[^>]+>/i);
  if (m && m.index && m.index > 0) return { visible: html.slice(0, m.index), quoted: html.slice(m.index) };
  return { visible: html, quoted: null };
}

function InboxPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("needs_response");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { data: convs, isFetching } = useSuspenseQuery(listOpts(tab));

  const filtered = useMemo(() => {
    if (!search.trim()) return convs;
    const q = search.toLowerCase();
    return (convs as any[]).filter((c) => {
      const name = [c.lead?.first_name, c.lead?.last_name].filter(Boolean).join(" ").toLowerCase();
      return name.includes(q) || (c.lead?.email || "").toLowerCase().includes(q) || (c.lead?.company?.name || "").toLowerCase().includes(q);
    });
  }, [convs, search]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ob-convs"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["ob-conv", selectedId] });
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Mail className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Email</h1>
        <div className="ml-auto relative w-full max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mail"
            className="pl-9 h-9 bg-muted/40 border-transparent focus-visible:bg-background"
          />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[220px_360px_1fr] min-h-0">
        {/* Sidebar folders */}
        <div className="hidden md:flex flex-col border-r border-border bg-muted/20 py-3 px-2 gap-0.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelectedId(null); }}
                className={cn(
                  "flex items-center gap-3 rounded-full pl-4 pr-3 py-2 text-sm font-medium text-left transition-colors",
                  active ? "bg-primary/15 text-primary" : "hover:bg-muted text-foreground/80",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                <span className="flex-1 truncate">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Message list */}
        <div className={cn("border-r border-border overflow-y-auto", selectedId && "hidden md:block")}>
          {/* Mobile tab bar */}
          <div className="md:hidden flex overflow-x-auto gap-1 p-2 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelectedId(null); }}
                className={cn("px-3 py-1.5 text-xs rounded-full whitespace-nowrap", tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {isFetching && !filtered.length && (
            <div className="p-6 text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!isFetching && filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No conversations
            </div>
          )}
          <ul className="divide-y divide-border">
            {filtered.map((c: any) => {
              const name = [c.lead?.first_name, c.lead?.last_name].filter(Boolean).join(" ") || c.lead?.email || "Unknown";
              const selected = selectedId === c.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "w-full text-left px-3 py-3 flex gap-3 hover:bg-muted/40 transition-colors",
                      selected && "bg-primary/10 hover:bg-primary/10",
                      c.needs_response && !selected && "bg-background",
                    )}
                  >
                    <div className={cn(
                      "h-9 w-9 shrink-0 rounded-full grid place-items-center text-xs font-semibold",
                      c.needs_response ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}>
                      {initials(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", c.needs_response ? "font-semibold" : "font-medium")}>{name}</span>
                        <span className={cn("text-[11px] shrink-0", c.needs_response ? "text-primary font-medium" : "text-muted-foreground")}>
                          {formatTimeShort(c.last_inbound_at || c.last_outbound_at)}
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{c.lead?.email}</div>
                      <div className="truncate text-xs text-muted-foreground mt-0.5">
                        {c.needs_response && <span className="inline-block mr-1.5 align-middle h-1.5 w-1.5 rounded-full bg-primary" />}
                        {CATEGORY_LABEL[c.category] || c.category}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Detail pane */}
        <div className={cn("overflow-hidden bg-background", !selectedId && "hidden md:block")}>
          {selectedId ? (
            <ConversationPane id={selectedId} onChange={invalidate} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="h-full grid place-items-center text-center text-muted-foreground p-8">
              <div>
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a conversation to view.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationPane({ id, onChange, onBack }: { id: string; onChange: () => void; onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ob-conv", id],
    queryFn: () => obGetConversation({ data: { id } }),
  });
  const [reply, setReply] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const send = useMutation({
    mutationFn: () => obSendReply({ data: { conversationId: id, bodyHtml: reply.replace(/\n/g, "<br>") } }),
    onSuccess: (r) => { toast.success(r.sentViaSmartlead ? "Reply sent" : "Reply saved"); setReply(""); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setCat = useMutation({
    mutationFn: (category: any) => obSetCategory({ data: { conversationId: id, category } }),
    onSuccess: () => { toast.success("Updated"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const quick = useMutation({
    mutationFn: (action: any) => obQuickAction({ data: { leadId: data!.conversation.lead_id, action } }),
    onSuccess: () => { toast.success("Done"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="h-full grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const c = data.conversation as any;
  const lead = c.lead;
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email;
  const subject = (data.messages[0] as any)?.subject || "(no subject)";
  const messages = data.messages as any[];

  return (
    <div className="flex flex-col h-full">
      {/* Header: subject + actions */}
      <div className="px-4 md:px-6 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg md:text-xl font-semibold truncate flex-1">{subject}</h2>
          <Select value={c.category} onValueChange={(v) => setCat.mutate(v)}>
            <SelectTrigger className="w-36 h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-xs font-semibold shrink-0">
            {initials(leadName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{leadName}</div>
            <div className="text-xs text-muted-foreground truncate">{lead.email}{lead.company?.name ? ` · ${lead.company.name}` : ""}</div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={() => quick.mutate("not_interested")} className="h-8">
              <XCircle className="h-3.5 w-3.5 mr-1.5" />Not interested
            </Button>
            <Button size="sm" variant="outline" onClick={() => quick.mutate("wrong_person")} className="h-8">
              <UserX className="h-3.5 w-3.5 mr-1.5" />Wrong person
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3">
        {messages.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No messages yet.</div>}
        {messages.map((m: any) => {
          const isInbound = m.direction === "inbound";
          const fromLabel = isInbound ? (m.from_email || lead.email) : (m.from_email || "you");
          const { visible, quoted } = stripQuotedReply(m.body_html || (m.body_text || "").replace(/\n/g, "<br>"));
          const isOpen = expanded[m.id] ?? false;
          return (
            <div key={m.id} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 bg-muted/20">
                <div className={cn("h-8 w-8 rounded-full grid place-items-center text-[11px] font-semibold shrink-0",
                  isInbound ? "bg-primary/15 text-primary" : "bg-muted text-foreground")}>
                  {initials(fromLabel)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {isInbound ? leadName : "You"}
                    <span className="text-muted-foreground font-normal ml-1.5">&lt;{fromLabel}&gt;</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    to {m.to_email || (isInbound ? "you" : lead.email)}
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {m.sent_at ? new Date(m.sent_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                </span>
              </div>
              <div className="px-4 py-3 text-sm">
                <div
                  className="prose prose-sm max-w-none dark:prose-invert [&_a]:text-primary [&_a]:underline break-words"
                  dangerouslySetInnerHTML={{ __html: visible || "<em>(empty)</em>" }}
                />
                {quoted && (
                  <>
                    <button
                      onClick={() => setExpanded((s) => ({ ...s, [m.id]: !isOpen }))}
                      className="mt-2 text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/70 text-muted-foreground"
                    >
                      {isOpen ? "Hide" : "Show"} quoted text
                    </button>
                    {isOpen && (
                      <div
                        className="mt-2 pl-3 border-l-2 border-border text-xs text-muted-foreground prose prose-xs max-w-none dark:prose-invert break-words"
                        dangerouslySetInnerHTML={{ __html: quoted }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3 md:p-4 bg-background">
        <div className="rounded-lg border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-colors">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={`Reply to ${leadName}…`}
            rows={3}
            className="border-0 focus-visible:ring-0 resize-none min-h-[72px]"
          />
          <div className="flex justify-between items-center px-2 py-1.5 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">Sent via Smartlead</span>
            <Button size="sm" disabled={!reply.trim() || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
