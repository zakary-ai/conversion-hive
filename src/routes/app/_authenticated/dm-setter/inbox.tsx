import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  obListConversations, obGetConversation, obSendReply, obQuickAction,
  obListTags, obCreateTag, obDeleteTag, obToggleTagOnConversation,
} from "@/lib/api/ob.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Send, XCircle, Mail, Search, ArrowLeft, UserX, MoreHorizontal,
  Tag as TagIcon, Plus, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const convsOpts = (tagId: string | null) => queryOptions({
  queryKey: ["ob-convs", tagId ?? "all"],
  queryFn: () => obListConversations({ data: { tagId: tagId ?? undefined } }),
});
const tagsOpts = queryOptions({
  queryKey: ["ob-tags"],
  queryFn: () => obListTags(),
});

export const Route = createFileRoute("/app/_authenticated/dm-setter/inbox")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(convsOpts(null)),
    context.queryClient.ensureQueryData(tagsOpts),
  ]),
  component: InboxPage,
});

const TAG_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];

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
  const idx = html.search(/<div[^>]*class="[^"]*gmail_quote[^"]*"/i);
  if (idx > 0) return { visible: html.slice(0, idx), quoted: html.slice(idx) };
  const m = html.match(/<[^>]+>On\s+[^<]{5,80}wrote:<\/[^>]+>/i);
  if (m && m.index && m.index > 0) return { visible: html.slice(0, m.index), quoted: html.slice(m.index) };
  return { visible: html, quoted: null };
}

function hasContent(m: any): boolean {
  const raw = (m.body_html || m.body_text || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  return raw.length > 0;
}

function InboxPage() {
  const qc = useQueryClient();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { data: convs, isFetching } = useSuspenseQuery(convsOpts(tagFilter));
  const { data: tags } = useSuspenseQuery(tagsOpts);

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
    qc.invalidateQueries({ queryKey: ["ob-tags"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["ob-conv", selectedId] });
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Mail className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Inbox</h1>
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

      {/* Tag filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border overflow-x-auto">
        <button
          onClick={() => setTagFilter(null)}
          className={cn(
            "shrink-0 px-3 h-7 rounded-full text-xs font-medium border transition-colors",
            tagFilter === null ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted",
          )}
        >
          All
        </button>
        {(tags as any[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTagFilter(t.id)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-medium border transition-colors",
              tagFilter === t.id ? "text-white" : "hover:bg-muted",
            )}
            style={tagFilter === t.id ? { backgroundColor: t.color, borderColor: t.color } : { borderColor: t.color + "60" }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
            {t.name}
          </button>
        ))}
        <ManageTagsPopover tags={tags as any[]} onChange={invalidate} />
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[380px_1fr] min-h-0">
        {/* Message list */}
        <div className={cn("border-r border-border overflow-y-auto", selectedId && "hidden md:block")}>
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
                      {(c.tags as any[])?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(c.tags as any[]).map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{ backgroundColor: t.color + "22", color: t.color }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
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
            <ConversationPane
              id={selectedId}
              tags={tags as any[]}
              onChange={invalidate}
              onBack={() => setSelectedId(null)}
            />
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

function ManageTagsPopover({ tags, onChange }: { tags: any[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const create = useMutation({
    mutationFn: () => obCreateTag({ data: { name: name.trim(), color } }),
    onSuccess: () => { setName(""); onChange(); toast.success("Tag created"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => obDeleteTag({ data: { id } }),
    onSuccess: () => { onChange(); toast.success("Tag deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="shrink-0 inline-flex items-center gap-1 px-3 h-7 rounded-full text-xs font-medium border border-dashed border-border hover:bg-muted">
          <Plus className="h-3 w-3" /> Manage tags
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold mb-1.5">New tag</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tag name"
              className="h-8 text-sm mb-2"
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create.mutate(); }}
            />
            <div className="flex gap-1.5 mb-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("h-5 w-5 rounded-full border-2", color === c ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button size="sm" className="w-full h-8" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add tag"}
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="pt-2 border-t">
              <div className="text-xs font-semibold mb-1.5">Your tags</div>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {tags.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm px-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="flex-1 truncate">{t.name}</span>
                    <button
                      onClick={() => del.mutate(t.id)}
                      className="opacity-60 hover:opacity-100 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ConversationTagPicker({
  conversationId, tags, currentTagIds, onChange,
}: { conversationId: string; tags: any[]; currentTagIds: Set<string>; onChange: () => void }) {
  const toggle = useMutation({
    mutationFn: (p: { tagId: string; assign: boolean }) =>
      obToggleTagOnConversation({ data: { conversationId, tagId: p.tagId, assign: p.assign } }),
    onSuccess: () => onChange(),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <TagIcon className="h-3.5 w-3.5 mr-1.5" /> Tags
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        {tags.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-2">
            No tags yet. Create one from the filter bar above.
          </div>
        ) : (
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {tags.map((t) => {
              const active = currentTagIds.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle.mutate({ tagId: t.id, assign: !active })}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="flex-1 text-left truncate">{t.name}</span>
                  {active && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ConversationPane({ id, tags, onChange, onBack }: {
  id: string; tags: any[]; onChange: () => void; onBack: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["ob-conv", id],
    queryFn: () => obGetConversation({ data: { id } }),
  });
  // Also refetch the parent list-level tags for this conversation
  const listQ = useQuery({
    queryKey: ["ob-conv-tags", id],
    queryFn: async () => {
      const all = await obListConversations({ data: {} });
      return (all as any[]).find((c) => c.id === id)?.tags ?? [];
    },
  });
  const [reply, setReply] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const send = useMutation({
    mutationFn: () => obSendReply({ data: { conversationId: id, bodyHtml: reply.replace(/\n/g, "<br>") } }),
    onSuccess: (r) => { toast.success(r.sentViaSmartlead ? "Reply sent" : "Reply saved"); setReply(""); onChange(); },
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
  const allMessages = data.messages as any[];
  const messages = allMessages.filter(hasContent);
  const subject = messages[0]?.subject || allMessages[0]?.subject || "(no subject)";
  const currentTags = (listQ.data as any[]) ?? [];
  const currentTagIds = new Set(currentTags.map((t: any) => t.id));

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg md:text-xl font-semibold truncate flex-1">{subject}</h2>
          <ConversationTagPicker
            conversationId={id}
            tags={tags}
            currentTagIds={currentTagIds}
            onChange={() => { onChange(); listQ.refetch(); }}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-xs font-semibold shrink-0">
            {initials(leadName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{leadName}</div>
            <div className="text-xs text-muted-foreground truncate">{lead.email}{lead.company?.name ? ` · ${lead.company.name}` : ""}</div>
            {currentTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {currentTags.map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ backgroundColor: t.color + "22", color: t.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </span>
                ))}
              </div>
            )}
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

      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-6">
          {messages.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No messages yet.</div>}
          {messages.map((m: any, idx: number) => {
            const isInbound = m.direction === "inbound";
            const fromLabel = isInbound ? (m.from_email || lead.email) : (m.from_email || "you");
            const displayName = isInbound ? leadName : "You";
            const { visible, quoted } = stripQuotedReply(m.body_html || (m.body_text || "").replace(/\n/g, "<br>"));
            const isOpen = expanded[m.id] ?? false;
            return (
              <div key={m.id} className={cn("pb-6", idx < messages.length - 1 && "border-b border-border")}>
                <div className="flex items-start gap-3">
                  <div className={cn("h-10 w-10 rounded-full grid place-items-center text-sm font-semibold shrink-0",
                    isInbound ? "bg-primary/15 text-primary" : "bg-muted text-foreground")}>
                    {initials(displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{displayName}</span>
                      <span className="text-xs text-muted-foreground">&lt;{fromLabel}&gt;</span>
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        {m.sent_at ? new Date(m.sent_at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-3">
                      to {m.to_email || (isInbound ? "me" : lead.email)}
                    </div>
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert [&_a]:text-primary [&_a]:underline break-words text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: visible || (m.body_text ? m.body_text.replace(/\n/g, "<br>") : "") }}
                    />
                    {quoted && (
                      <div className="mt-2">
                        <button
                          onClick={() => setExpanded((s) => ({ ...s, [m.id]: !isOpen }))}
                          title={isOpen ? "Hide quoted text" : "Show quoted text"}
                          className="inline-flex items-center justify-center h-5 w-8 rounded bg-muted hover:bg-muted/70 text-muted-foreground"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {isOpen && (
                          <div
                            className="mt-2 pl-3 border-l-2 border-border text-xs text-muted-foreground prose prose-xs max-w-none dark:prose-invert break-words"
                            dangerouslySetInnerHTML={{ __html: quoted }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
