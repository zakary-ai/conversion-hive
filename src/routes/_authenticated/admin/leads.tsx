import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAllLeads, listClients, createLead, adminUpdateLead, deleteLead, bulkDeleteLeads } from "@/lib/api/cl.functions";
import { PageHeader, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminLeadsTabs } from "@/components/admin-leads-tabs";

const leadsOpts = queryOptions({ queryKey: ["all-leads"], queryFn: () => listAllLeads() });
const clientsOpts = queryOptions({ queryKey: ["clients"], queryFn: () => listClients() });
const STATUSES = ["New","Contacted","No Answer","Interested","Booked","Not Interested","Follow Up"] as const;
type Status = typeof STATUSES[number];
type Lead = Awaited<ReturnType<typeof listAllLeads>>[number];

export const Route = createFileRoute("/_authenticated/admin/leads")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(leadsOpts),
    context.queryClient.ensureQueryData(clientsOpts),
  ]),
  component: AdminLeads,
});

function AdminLeads() {
  const { data: leads } = useSuspenseQuery(leadsOpts);
  const { data: clients } = useSuspenseQuery(clientsOpts);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const clientName = (uid: string | null) => uid ? (clients.find((c) => c.user_id === uid)?.full_name ?? clients.find((c) => c.user_id === uid)?.email ?? "—") : "Unassigned";

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (clientFilter !== "all" && l.assigned_user_id !== clientFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (l.name?.toLowerCase().includes(s) || l.company?.toLowerCase().includes(s));
    }
    return true;
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteLead({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["all-leads"] }); },
  });

  const bulkDel = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteLeads({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.count} lead${r.count === 1 ? "" : "s"}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["all-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleOne = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allFilteredSelected) filtered.forEach((l) => n.delete(l.id));
    else filtered.forEach((l) => n.add(l.id));
    return n;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <AdminLeadsTabs />
      <PageHeader title="All leads" description={`${leads.length} total`} action={
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add lead</Button>
      } />

      <Card className="p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 w-10">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3 hidden md:table-cell">Client</th>
                <th className="text-left p-3 hidden lg:table-cell">Company</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No leads.</td></tr>}
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggleOne(l.id)} aria-label={`Select ${l.name}`} />
                  </td>
                  <td className="p-3 font-medium">{l.name}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{clientName(l.assigned_user_id)}</td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">{l.company}</td>
                  <td className="p-3"><StatusPill status={l.status} /></td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Delete?") && del.mutate(l.id)}><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <LeadDialog open={open} onOpenChange={setOpen} lead={editing} clients={clients} />
    </div>
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
