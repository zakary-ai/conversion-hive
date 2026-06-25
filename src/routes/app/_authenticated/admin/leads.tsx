import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

import { listAllLeads, listClients, createLead, adminUpdateLead, deleteLead, bulkDeleteLeads, getLeadDetail } from "@/lib/api/cl.functions";
import { PageHeader, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Pencil, Trash2, Search, Phone, Mail, Building2, ChevronDown, User as UserIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AdminLeadsTabs } from "@/components/admin-leads-tabs";

const PAGE_SIZE = 50;
const clientsOpts = queryOptions({ queryKey: ["clients"], queryFn: () => listClients() });
const leadsPageOpts = (page: number, search: string, status: string, clientId: string) =>
  queryOptions({
    queryKey: ["all-leads", { page, search, status, clientId }],
    queryFn: () => listAllLeads({ data: { page, pageSize: PAGE_SIZE, search, status, clientId } }),
  });
const STATUSES = ["New","Contacted","No Answer","Interested","Booked","Not Interested","Follow Up"] as const;
type Status = typeof STATUSES[number];

type Lead = Awaited<ReturnType<typeof listAllLeads>>["rows"][number];

export const Route = createFileRoute("/app/_authenticated/admin/leads")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(leadsPageOpts(0, "", "all", "all")),
    context.queryClient.ensureQueryData(clientsOpts),
  ]),
  component: AdminLeads,
});

const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}


function AdminLeads() {
  const { data: clients } = useSuspenseQuery(clientsOpts);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebounced(search, 300);
  // reset to first page whenever a filter changes
  useEffect(() => { setPage(0); }, [debouncedSearch, statusFilter, clientFilter]);

  const { data, isFetching } = useSuspenseQuery(leadsPageOpts(page, debouncedSearch, statusFilter, clientFilter));
  const rows = data.rows;
  const total = data.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clientName = (uid: string | null) => uid ? (clients.find((c) => c.user_id === uid)?.full_name ?? clients.find((c) => c.user_id === uid)?.email ?? "—") : "Unassigned";

  const invalidateLeads = () => qc.invalidateQueries({ queryKey: ["all-leads"] });

  const del = useMutation({
    mutationFn: (id: string) => deleteLead({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); invalidateLeads(); },
  });

  const bulkDel = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteLeads({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.count} lead${r.count === 1 ? "" : "s"}`);
      setSelected(new Set());
      invalidateLeads();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleOne = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allPageSelected = rows.length > 0 && rows.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allPageSelected) rows.forEach((l) => n.delete(l.id));
    else rows.forEach((l) => n.add(l.id));
    return n;
  });

  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-7xl">
      <AdminLeadsTabs />
      <PageHeader title="All leads" description={`${total.toLocaleString()} total`} action={
        <Button onClick={() => { setEditing(null); setEditOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add lead</Button>
      } />

      <Card className="p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, company, phone, email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {clients.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.full_name || c.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {selected.size > 0 && (
        <Card className="p-3 flex items-center justify-between gap-3 border-primary/40 bg-primary/5">
          <div className="text-sm">{selected.size} selected</div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkDel.isPending}
              onClick={() => {
                if (confirm(`Delete ${selected.size} lead${selected.size === 1 ? "" : "s"}?`)) {
                  bulkDel.mutate(Array.from(selected));
                }
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" />Delete selected
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 w-10">
                  <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3 hidden md:table-cell">Client</th>
                <th className="text-left p-3 hidden lg:table-cell">Company</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No leads.</td></tr>}
              {rows.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  onClick={() => setDetailLeadId(l.id)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggleOne(l.id)} aria-label={`Select ${l.name}`} />
                  </td>
                  <td className="p-3 font-medium">
                    <div>{l.name}</div>
                    <div className="md:hidden text-xs text-muted-foreground truncate">{clientName(l.assigned_user_id)}</div>
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{clientName(l.assigned_user_id)}</td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">{l.company}</td>
                  <td className="p-3"><StatusPill status={l.status} /></td>
                  <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(l); setEditOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Delete?") && del.mutate(l.id)}><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 p-3 border-t border-border text-sm">
          <div className="text-muted-foreground">
            {isFetching ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</span> : <>Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}</>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0 || isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
            <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      <LeadDialog open={editOpen} onOpenChange={setEditOpen} lead={editing} clients={clients} />
      <AdminLeadDetailDialog
        leadId={detailLeadId}
        onClose={() => setDetailLeadId(null)}
        onEdit={(l) => { setDetailLeadId(null); setEditing(l); setEditOpen(true); }}
      />
    </div>
  );
}


function AdminLeadDetailDialog({
  leadId,
  onClose,
  onEdit,
}: {
  leadId: string | null;
  onClose: () => void;
  onEdit: (l: Lead) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead-detail", leadId],
    queryFn: () => getLeadDetail({ data: { lead_id: leadId! } }),
    enabled: !!leadId,
  });

  const lead = data?.lead;
  const calls = data?.calls ?? [];
  const setter = data?.setter ?? null;
  const realCalls = calls.filter((c) => c.status !== "manual_outcome");

  return (
    <Dialog open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        {isLoading || !lead ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-left">
                <span className="min-w-0 truncate text-lg sm:text-xl">{lead.name}</span>
                <div className="shrink-0">
                  <StatusPill status={lead.status} />
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                  <UserIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    Setter:{" "}
                    <span className="text-foreground">
                      {setter ? (setter.full_name || setter.email || "—") : "Unassigned"}
                    </span>
                  </span>
                </div>
                {lead.company && (
                  <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="truncate">{lead.company}</span>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                    <Phone className="h-4 w-4 shrink-0" />
                    <a href={`tel:${lead.phone}`} className="truncate hover:text-foreground">{lead.phone}</a>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                    <Mail className="h-4 w-4 shrink-0" />
                    <a href={`mailto:${lead.email}`} className="truncate hover:text-foreground">{lead.email}</a>
                  </div>
                )}
                {lead.source && (
                  <div className="text-muted-foreground text-xs uppercase tracking-wider min-w-0 truncate">
                    Source: <span className="normal-case text-foreground">{lead.source}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border p-2 min-w-0">
                  <div className="uppercase tracking-wider text-muted-foreground">Created</div>
                  <div className="truncate">{fmtDateTime(lead.created_at)}</div>
                </div>
                <div className="rounded-md border border-border p-2 min-w-0">
                  <div className="uppercase tracking-wider text-muted-foreground">Last update</div>
                  <div className="truncate">{fmtDateTime(lead.last_status_change_at)}</div>
                </div>
                {lead.contacted_at && (
                  <div className="rounded-md border border-border p-2 min-w-0">
                    <div className="uppercase tracking-wider text-muted-foreground">Contacted</div>
                    <div className="truncate">{fmtDateTime(lead.contacted_at)}</div>
                  </div>
                )}
                {lead.callback_at && (
                  <div className="rounded-md border border-border p-2 min-w-0">
                    <div className="uppercase tracking-wider text-muted-foreground">Callback</div>
                    <div className="truncate">{fmtDateTime(lead.callback_at)}</div>
                  </div>
                )}
              </div>

              {lead.notes && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3">{lead.notes}</div>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Call recordings &amp; transcripts ({calls.length})
                </div>
                {calls.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No calls yet for this lead.</div>
                ) : (
                  <div className="divide-y divide-border rounded-md border border-border">
                    {calls.map((c) => (
                      <AdminCallRow key={c.id} call={c} />
                    ))}
                  </div>
                )}
                {realCalls.length === 0 && calls.length > 0 && (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    No real call recordings — outcome was logged manually.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                <Button size="sm" onClick={() => onEdit(lead as Lead)}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type AdminCallItem = {
  id: string;
  created_at: string;
  started_at: string | null;
  duration_sec: number | null;
  status: string | null;
  to_number: string | null;
  recording_url: string | null;
  transcript: string | null;
  transcript_status: string | null;
  summary: string | null;
};

function AdminCallRow({ call }: { call: AdminCallItem }) {
  const [open, setOpen] = useState(false);
  const when = call.started_at || call.created_at;
  const duration = call.duration_sec
    ? `${Math.floor(call.duration_sec / 60)}m ${call.duration_sec % 60}s`
    : null;
  const hasArtifacts = !!(call.recording_url || call.transcript || call.summary);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full p-3 flex items-center gap-3 text-sm hover:bg-muted/30 text-left">
        <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
          <Phone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{call.to_number || "Unknown"}</div>
          <div className="text-xs text-muted-foreground truncate">
            {new Date(when).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            {duration && <> · {duration}</>}
            {call.status && <> · {call.status}</>}
          </div>
        </div>
        {hasArtifacts && <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-4 space-y-3">
          {call.recording_url ? (
            <audio controls preload="none" src={call.recording_url} className="w-full" />
          ) : (
            <div className="text-xs text-muted-foreground">Recording not available.</div>
          )}
          {call.summary && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Summary</div>
              <div className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3">{call.summary}</div>
            </div>
          )}
          {call.transcript ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Transcript {call.transcript_status && call.transcript_status !== "completed" && <>· {call.transcript_status}</>}
              </div>
              <div className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 max-h-80 overflow-y-auto">
                {call.transcript}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Transcript not available yet.</div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LeadDialog({ open, onOpenChange, lead, clients }: { open: boolean; onOpenChange: (o: boolean) => void; lead: Lead | null; clients: Awaited<ReturnType<typeof listClients>> }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: lead?.name ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    company: lead?.company ?? "",
    source: lead?.source ?? "",
    status: (lead?.status ?? "New") as Status,
    notes: lead?.notes ?? "",
    assigned_user_id: lead?.assigned_user_id ?? "",
  });
  const [lastId, setLastId] = useState(lead?.id);
  if (lead?.id !== lastId) {
    setLastId(lead?.id);
    setForm({
      name: lead?.name ?? "", phone: lead?.phone ?? "", email: lead?.email ?? "",
      company: lead?.company ?? "", source: lead?.source ?? "", status: (lead?.status ?? "New") as Status,
      notes: lead?.notes ?? "", assigned_user_id: lead?.assigned_user_id ?? "",
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, assigned_user_id: form.assigned_user_id || null };
      if (lead) await adminUpdateLead({ data: { ...payload, id: lead.id } });
      else await createLead({ data: payload });
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["all-leads"] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{lead ? "Edit lead" : "New lead"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
            <div><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Company</Label><Input value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} /></div>
            <div><Label>Source</Label><Input value={form.source ?? ""} onChange={(e) => set("source", e.target.value)} /></div>
          </div>
          <div>
            <Label>Assigned client</Label>
            <Select value={form.assigned_user_id ?? ""} onValueChange={(v) => set("assigned_user_id", v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.full_name || c.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
