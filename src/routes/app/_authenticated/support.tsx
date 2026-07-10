import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  createTicket, listMyTickets, getTicket, replyToTicket,
} from "@/lib/api/support.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, Plus, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const MAX_SIZE = 5 * 1024 * 1024;

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/app/_authenticated/support")({
  validateSearch: searchSchema,
  component: SupportPage,
});

const CATEGORY_LABEL: Record<string, string> = {
  feedback: "Feedback", suggestion: "Suggestion", issue: "Issue", other: "Other",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open", awaiting_user: "Awaiting you", resolved: "Resolved",
};

async function uploadAttachments(ticketId: string, files: File[]) {
  const results: Array<{ storage_path: string; filename: string; content_type: string | null; size_bytes: number }> = [];
  for (const file of files) {
    if (file.size > MAX_SIZE) throw new Error(`${file.name} exceeds 5 MB limit`);
    const path = `${ticketId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("support-uploads").upload(path, file, {
      contentType: file.type || undefined, upsert: false,
    });
    if (error) throw new Error(error.message);
    results.push({ storage_path: path, filename: file.name, content_type: file.type || null, size_bytes: file.size });
  }
  return results;
}

function SupportPage() {
  const search = useSearch({ from: "/app/_authenticated/support" });
  const [selected, setSelected] = useState<string | null>(search.id ?? null);

  return selected ? (
    <TicketThread id={selected} onBack={() => setSelected(null)} />
  ) : (
    <TicketList onOpen={setSelected} />
  );
}

function TicketList({ onOpen }: { onOpen: (id: string) => void }) {
  const listFn = useServerFn(listMyTickets);
  const { data: tickets } = useSuspenseQuery({
    queryKey: ["support", "my-tickets"],
    queryFn: () => listFn(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="Support" description="Submit feedback, suggestions, or issues." />
        <NewTicketDialog />
      </div>

      {tickets.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No tickets yet. Click "New ticket" to submit feedback, a suggestion, or report an issue.
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpen(t.id)}
              className="w-full text-left"
            >
              <Card className="p-4 hover:border-primary/50 transition">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.subject}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Updated {new Date(t.last_message_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                    <Badge variant={t.status === "resolved" ? "outline" : "default"}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
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

function NewTicketDialog() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("feedback");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();
  const createFn = useServerFn(createTicket);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    for (const f of arr) {
      if (f.size > MAX_SIZE) { toast.error(`${f.name} exceeds 5 MB`); return; }
    }
    setFiles((prev) => [...prev, ...arr].slice(0, 5));
  };

  const submit = async () => {
    if (!subject.trim() || !message.trim()) { toast.error("Subject and message are required"); return; }
    setSubmitting(true);
    try {
      // Create ticket first (without attachments), then upload + attach via reply-less shortcut:
      // Simpler: create ticket with no attachments, then upload and re-open — but API supports attachments in create.
      // We need ticket_id path prefix; storage policy verifies via support_tickets row. So upload AFTER we have the ticket id.
      // Do a two-step: create ticket, then if files, upload and insert an additional message? No — attach to the same first message.
      // Easiest: skip attachments here (would need ticket_id first). Do create → get id → upload → replyToTicket for attachments? That creates second message.
      // Better: two-phase — create ticket with message + empty attachments; then upload files and post attachments via reply.
      const res = await createFn({ data: {
        category: category as any, subject: subject.trim(), message: message.trim(),
      }});
      if (files.length) {
        const uploaded = await uploadAttachments(res.id, files);
        // Attach files as an additional (user) reply so RLS/path check works with the created ticket id.
        const replyFn = replyToTicket;
        await replyFn({ data: { ticket_id: res.id, body: "(attachments)", attachments: uploaded } });
      }
      toast.success("Ticket submitted");
      setOpen(false);
      setCategory("feedback"); setSubject(""); setMessage(""); setFiles([]);
      qc.invalidateQueries({ queryKey: ["support"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1.5" /> New ticket</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New support ticket</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="feedback">Feedback</SelectItem>
                <SelectItem value="suggestion">Suggestion</SelectItem>
                <SelectItem value="issue">Issue / Bug</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Short summary" />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} rows={6} placeholder="Describe what's going on…" />
          </div>
          <div>
            <Label>Attachments <span className="text-xs text-muted-foreground">(optional, max 5 MB each, up to 5)</span></Label>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <div className="flex flex-wrap gap-2 mt-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate max-w-[180px]">{f.name}</span>
                  <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                </div>
              ))}
              {files.length < 5 && (
                <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5 mr-1" /> Add file
                </Button>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Submit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketThread({ id, onBack }: { id: string; onBack: () => void }) {
  const getFn = useServerFn(getTicket);
  const replyFn = useServerFn(replyToTicket);
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "ticket", id],
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
      toast.error(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const { ticket, messages } = data;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      </div>
      <Card className="p-4 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-lg">{ticket.subject}</div>
          <Badge variant="secondary">{CATEGORY_LABEL[ticket.category] ?? ticket.category}</Badge>
          <Badge variant={ticket.status === "resolved" ? "outline" : "default"}>{STATUS_LABEL[ticket.status] ?? ticket.status}</Badge>
        </div>
      </Card>

      <div className="space-y-3">
        {messages.map((m: any) => (
          <Card key={m.id} className={`p-3 ${m.is_admin ? "border-primary/40 bg-primary/5" : ""}`}>
            <div className="text-xs text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{m.is_admin ? "Admin" : (m.author?.full_name || m.author?.email || "You")}</span>
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
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write a reply…" maxLength={4000} />
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
