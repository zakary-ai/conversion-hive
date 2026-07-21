import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { obListConversations, obGetConversation, obSendReply, obSetCategory, obQuickAction } from "@/lib/api/ob.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Loader2, Send, XCircle, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "needs_response", label: "Needs response" },
  { key: "positive", label: "Positive" },
  { key: "question", label: "Question" },
  { key: "objection", label: "Objection" },
  { key: "meeting_booked", label: "Meetings" },
  { key: "other", label: "Other" },
] as const;

const listOpts = (tab: string) => queryOptions({
  queryKey: ["ob-convs", tab],
  queryFn: () => obListConversations({ data: { tab } }),
});

export const Route = createFileRoute("/app/_authenticated/dm-setter/inbox")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listOpts("needs_response")),
  component: InboxPage,
});

function InboxPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("needs_response");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: convs, isFetching } = useSuspenseQuery(listOpts(tab));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ob-convs"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["ob-conv", selectedId] });
  };

  return (
    <div className="space-y-4 max-w-7xl">
      <PageHeader
        title="Email"
        description="Unified conversations across your leads"
        action={
          <Button asChild variant="outline">
            <a href="https://app.smartlead.ai" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Smartlead Inbox
            </a>
          </Button>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 min-h-[70vh]">
        <Card className="p-2 flex flex-col overflow-hidden">
          <div className="flex flex-wrap gap-1 p-1 mb-2">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => { setTab(t.key); setSelectedId(null); }}
                className={cn("px-2 py-1 text-xs rounded-md", tab === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {isFetching && !convs.length && <div className="p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}
            {!isFetching && convs.length === 0 && <div className="p-4 text-sm text-muted-foreground">No conversations here.</div>}
            {convs.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={cn("w-full text-left p-3 hover:bg-muted/30", selectedId === c.id && "bg-muted/50")}>
                <div className="flex justify-between gap-2 text-sm font-medium">
                  <span className="truncate">{[c.lead?.first_name, c.lead?.last_name].filter(Boolean).join(" ") || c.lead?.email || "—"}</span>
                  {c.needs_response && <span className="text-[10px] rounded-full bg-amber-500/20 text-amber-700 px-1.5">reply</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{c.lead?.company?.name}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{c.category} · {c.last_inbound_at ? new Date(c.last_inbound_at).toLocaleString() : ""}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          {selectedId ? <ConversationPane id={selectedId} onChange={invalidate} /> : (
            <div className="p-6 text-center text-muted-foreground">Select a conversation to view.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ConversationPane({ id, onChange }: { id: string; onChange: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ob-conv", id],
    queryFn: () => obGetConversation({ data: { id } }),
  });
  const [reply, setReply] = useState("");

  const send = useMutation({
    mutationFn: () => obSendReply({ data: { conversationId: id, bodyHtml: reply } }),
    onSuccess: (r) => { toast.success(r.sentViaSmartlead ? "Reply sent via Smartlead" : "Reply saved (no Smartlead thread)"); setReply(""); onChange(); },
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

  if (isLoading || !data) return <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const c = data.conversation as any;
  const lead = c.lead;

  return (
    <div className="flex flex-col h-[70vh]">
      <div className="p-4 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold flex items-center gap-2">
            <User className="h-4 w-4" />
            {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {lead.title ? `${lead.title} · ` : ""}{lead.company?.name} · {lead.email}
          </div>
          {lead.selection_reason && <div className="mt-1 text-xs text-muted-foreground italic">"{lead.selection_reason}"</div>}
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <Select value={c.category} onValueChange={(v) => setCat.mutate(v)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["uncategorized","positive","question","objection","info_requested","out_of_office","not_interested","wrong_person","unsubscribe","meeting_booked"].map((k) => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => quick.mutate("not_interested")}><XCircle className="h-3 w-3 mr-1" />Not interested</Button>
            <Button size="sm" variant="outline" onClick={() => quick.mutate("wrong_person")}>Wrong person</Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {data.messages.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No messages yet.</div>}
        {data.messages.map((m: any) => (
          <div key={m.id} className={cn("rounded-md border p-3 text-sm", m.direction === "inbound" ? "bg-muted/30 border-border" : "bg-primary/5 border-primary/20 ml-8")}>
            <div className="flex justify-between text-[10px] uppercase text-muted-foreground mb-1">
              <span>{m.direction === "inbound" ? "From" : "To"}: {m.direction === "inbound" ? m.from_email : m.to_email}</span>
              <span>{m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}</span>
            </div>
            {m.subject && <div className="text-xs font-medium mb-1">{m.subject}</div>}
            <div className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: m.body_html || (m.body_text || "").replace(/\n/g, "<br>") }} />
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3">
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" rows={3} />
        <div className="flex justify-end mt-2">
          <Button disabled={!reply || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
