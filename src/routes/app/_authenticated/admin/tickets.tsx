import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListTickets, getTicket, replyToTicket, adminUpdateTicketStatus, adminDeleteTicket,
} from "@/lib/api/support.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, X, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

const MAX_SIZE = 5 * 1024 * 1024;
const CATEGORY_LABEL: Record<string, string> = { feedback: "Feedback", suggestion: "Suggestion", issue: "Issue", other: "Other" };
const STATUS_LABEL: Record<string, string> = { open: "Open", awaiting_user: "Awaiting user", resolved: "Resolved" };

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/app/_authenticated/admin/tickets")({
  validateSearch: searchSchema,
  component: AdminTicketsPage,
});

async function uploadAttachments(ticketId: string, files: File[]) {
  const out: any[] = [];
  for (const f of files) {
    if (f.size > MAX_SIZE) throw new Error(`${f.name} exceeds 5 MB`);
    const path = `${ticketId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("support-uploads").upload(path, f, { contentType: f.type || undefined });
    if (error) throw new Error(error.message);
    out.push({ storage_path: path, filename: f.name, content_type: f.type || null, size_bytes: f.size });
  }
  return out;
}

function AdminTicketsPage() {
  const search = useSearch({ from: "/app/_authenticated/admin/tickets" });
  const [selected, setSelected] = useState<string | null>(search.id ?? null);
  return selected ? <AdminThread id={selected} onBack={() => setSelected(null)} /> : <AdminList onOpen={setSelected} />;
}

function AdminList({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");
  const listFn = useServerFn(adminListTickets);

  const { data: tickets } = useSuspenseQuery({
    queryKey: ["support", "admin", status, category, searchQ],
    queryFn: () => listFn({ data: {
      status: status === "all" ? undefined : status as any,
      category: category === "all" ? undefined : category as any,
      search: searchQ || undefined,
    } as any }),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Support tickets" description="User-submitted feedback, suggestions, and issues." />

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="awaiting_user">Awaiting user</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="feedback">Feedback</SelectItem>
            <SelectItem value="suggestion">Suggestion</SelectItem>
            <SelectItem value="issue">Issue</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search subject…" className="w-56" />
      </Card>

      {tickets.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No tickets match those filters.</Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t: any) => (
            <button key={t.id} onClick={() => onOpen(t.id)} className="w-full text-left">
              <Card className="p-4 hover:border-primary/50 transition">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.subject}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t.submitter?.full_name || t.submitter?.email || "Unknown"} · {new Date(t.last_message_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                    <Badge variant={t.status === "resolved" ? "outline" : "default"}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminThread({ id, onBack }: { id: string; onBack: () => void }) {
  const getFn = useServerFn(getTicket);
  const replyFn = useServerFn(replyToTicket);
  const statusFn = useServerFn(adminUpdateTicketStatus);
  const delFn = useServerFn(adminDeleteTicket);
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "admin", "ticket", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      let uploaded: any[] = [];
      if (files.length) uploaded = await uploadAttachments(id, files);
      await replyFn({ data: { ticket_id: id, body: body.trim(), attachments: uploaded } });
      setBody(""); setFiles([]);
      qc.invalidateQueries({ queryKey: ["support"] });
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally { setSending(false); }
  };

  const changeStatus = async (s: string) => {
    try {
      await statusFn({ data: { id, status: s as any } });
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["support"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const del = async () => {
    if (!confirm("Delete this ticket permanently?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["support"] });
      onBack();
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const { ticket, submitter, messages } = data as any;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-lg">{ticket.subject}</div>
          <Badge variant="secondary">{CATEGORY_LABEL[ticket.category] ?? ticket.category}</Badge>
          <Badge variant={ticket.status === "resolved" ? "outline" : "default"}>{STATUS_LABEL[ticket.status] ?? ticket.status}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          From <span className="text-foreground font-medium">{submitter?.full_name || submitter?.email || "Unknown"}</span>
          {submitter?.email ? ` · ${submitter.email}` : ""} · opened {new Date(ticket.created_at).toLocaleString()}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Select value={ticket.status} onValueChange={changeStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="awaiting_user">Awaiting user</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="destructive" size="sm" onClick={del}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
        </div>
      </Card>

      <div className="space-y-3">
        {messages.map((m: any) => (
          <Card key={m.id} className={`p-3 ${m.is_admin ? "border-primary/40 bg-primary/5" : ""}`}>
            <div className="text-xs text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{m.is_admin ? "Admin" : (m.author?.full_name || m.author?.email || "User")}</span>
              {" · "}{new Date(m.created_at).toLocaleString()}
            </div>
            <div className="whitespace-pre-wrap text-sm">{m.body}</div>
            {m.attachments?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attachments.map((a: any) => (
                  <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                    <Paperclip className="h-3 w-3" /> {a.filename}
                  </a>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {ticket.status !== "resolved" && (
        <Card className="p-3 space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Reply to user…" maxLength={4000} />
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => {
            const list = e.target.files; if (!list) return;
            const arr = Array.from(list);
            for (const f of arr) if (f.size > MAX_SIZE) { toast.error(`${f.name} exceeds 5 MB`); return; }
            setFiles((p) => [...p, ...arr].slice(0, 5));
          }} />
          <div className="flex items-center gap-2 flex-wrap">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3" /><span className="truncate max-w-[160px]">{f.name}</span>
                <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
              </div>
            ))}
            {files.length < 5 && (
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-3.5 w-3.5 mr-1" /> Attach
              </Button>
            )}
            <div className="ml-auto">
              <Button onClick={send} disabled={sending || !body.trim()}>{sending ? "Sending…" : "Send reply"}</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
