import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useRef, useMemo } from "react";
import { obListLeads, obListSetters, obImportLeads, obAssignLeads, obGetLead } from "@/lib/api/ob.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { parseCsv } from "@/lib/csv";
import { OutboundTabs } from "@/components/outbound-tabs";

const PAGE_SIZE = 50;
const settersOpts = queryOptions({ queryKey: ["ob-setters"], queryFn: () => obListSetters() });
const leadsOpts = (p: any) => queryOptions({
  queryKey: ["ob-leads", p],
  queryFn: () => obListLeads({ data: p }),
});

export const Route = createFileRoute("/app/_authenticated/admin/outbound/leads")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(settersOpts),
    context.queryClient.ensureQueryData(leadsOpts({ page: 0, pageSize: PAGE_SIZE, search: "", status: "all", ownerSetterId: "all", emailStatus: "all", niche: "" })),
  ]),
  component: OutboundLeadsPage,
});

function OutboundLeadsPage() {
  const qc = useQueryClient();
  const { data: setters } = useSuspenseQuery(settersOpts);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [emailStatus, setEmailStatus] = useState("all");
  const [niche, setNiche] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const params = { page, pageSize: PAGE_SIZE, search, status, ownerSetterId: owner, emailStatus, niche };
  const { data, isFetching } = useSuspenseQuery(leadsOpts(params));
  const rows = data.rows;
  const total = data.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const setterName = (id: string | null) => id ? (setters.find((s) => s.user_id === id)?.name ?? "—") : "Unassigned";

  const invalidateAll = () => qc.invalidateQueries({ queryKey: ["ob-leads"] });

  const allSelected = rows.length > 0 && rows.every((r: any) => selected.has(r.id));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allSelected) rows.forEach((r: any) => n.delete(r.id));
    else rows.forEach((r: any) => n.add(r.id));
    return n;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <OutboundTabs />
      <PageHeader title="Outbound leads" description={`${total.toLocaleString()} total`} action={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-1" />Import CSV</Button>
          <Button disabled={!selected.size} onClick={() => setAssignOpen(true)}><Users className="h-4 w-4 mr-1" />Assign ({selected.size})</Button>
        </div>
      } />

      <Card className="p-4 flex gap-3 flex-wrap">
        <Input placeholder="Search name, email, phone…" value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} className="flex-1 min-w-[200px]" />
        <Select value={owner} onValueChange={(v) => { setPage(0); setOwner(v); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {setters.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setPage(0); setStatus(v); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["new","queued","in_sequence","replied","positive","meeting_booked","discovery_scheduled","not_interested","unsubscribed","disqualified","closed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={emailStatus} onValueChange={(v) => { setPage(0); setEmailStatus(v); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any email</SelectItem>
            {["unverified","valid","invalid","catch_all","unknown","role_based"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Niche…" value={niche} onChange={(e) => { setPage(0); setNiche(e.target.value); }} className="w-[160px]" />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
              <th className="text-left p-3">Contact</th>
              <th className="text-left p-3 hidden md:table-cell">Company</th>
              <th className="text-left p-3 hidden lg:table-cell">Owner</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3 hidden md:table-cell">Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No leads. Import a CSV to get started.</td></tr>}
            {rows.map((l: any) => (
              <tr key={l.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDetailId(l.id)}>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(l.id)} onCheckedChange={() => setSelected((s) => {
                    const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n;
                  })} />
                </td>
                <td className="p-3 font-medium">
                  <div>{[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{l.title || ""}</div>
                </td>
                <td className="p-3 hidden md:table-cell text-muted-foreground">{l.company?.name || "—"}</td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground">{setterName(l.owner_setter_id)}</td>
                <td className="p-3"><span className="rounded-md bg-muted px-2 py-0.5 text-xs">{l.status}</span></td>
                <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                  <div className="truncate">{l.email || "—"}</div>
                  <div className="text-[10px] uppercase">{l.email_status}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-3 p-3 border-t border-border text-sm">
          <div className="text-muted-foreground">{isFetching ? <Loader2 className="inline h-3 w-3 animate-spin" /> : `Page ${page + 1} of ${totalPages}`}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={invalidateAll} />
      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} leadIds={Array.from(selected)} setters={setters} onDone={() => { setSelected(new Set()); invalidateAll(); }} />
      <LeadDetailDialog leadId={detailId} onClose={() => setDetailId(null)} setterName={setterName} />
    </div>
  );
}

function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const run = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) throw new Error("Empty CSV");
      // Send in chunks to keep payload manageable
      let imported = 0, duplicates = 0, suppressed = 0, invalid = 0;
      const CHUNK = 1000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const r = await obImportLeads({ data: { rows: chunk as any } });
        imported += r.imported; duplicates += r.duplicates.length; suppressed += r.suppressed.length; invalid += r.invalid.length;
      }
      setResult({ imported, duplicates, suppressed, invalid, total: rows.length });
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Import leads (CSV)</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Expected columns: <code className="text-xs">company_name, website, phone, address, city, state, google_rating, google_review_count, google_maps_url, niche, selection_reason, first_name, last_name, title, email, email_status, linkedin_url, lead_score</code>. Extra columns are ignored.
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Choose CSV</Button>
          {result && (
            <div className="rounded-md border border-border p-3 space-y-1">
              <div>Total rows: <b>{result.total}</b></div>
              <div className="text-emerald-600">Imported: {result.imported}</div>
              <div className="text-amber-600">Duplicates: {result.duplicates}</div>
              <div className="text-rose-600">Suppressed: {result.suppressed}</div>
              <div className="text-muted-foreground">Invalid: {result.invalid}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ open, onOpenChange, leadIds, setters, onDone }: any) {
  const [target, setTarget] = useState<string>("");
  const [override, setOverride] = useState(false);
  const [needsOverride, setNeedsOverride] = useState(false);

  const m = useMutation({
    mutationFn: () => obAssignLeads({ data: { leadIds, setterUserId: target || null, override } }),
    onSuccess: (r) => {
      if (r.needsOverride) { setNeedsOverride(true); toast.warning(`${r.conflicts} leads belong to companies with a different owner. Toggle override to force.`); return; }
      toast.success(`Assigned ${r.assigned} leads`);
      onDone(); onOpenChange(false); setTarget(""); setOverride(false); setNeedsOverride(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign {leadIds.length} leads</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger><SelectValue placeholder="Choose setter (or empty to unassign)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Unassign —</SelectItem>
              {setters.map((s: any) => <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {needsOverride && (
            <label className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
              <Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} />
              <span>Override company ownership conflicts</span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!target || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Assigning…" : "Assign"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadDetailDialog({ leadId, onClose, setterName }: any) {
  const { data, isLoading } = useQuery({
    queryKey: ["ob-lead", leadId],
    queryFn: () => obGetLead({ data: { id: leadId! } }),
    enabled: !!leadId,
  });
  const timeline = useMemo(() => {
    if (!data) return [] as any[];
    const items: any[] = [];
    data.activities.forEach((a: any) => items.push({ t: a.occurred_at, kind: "activity", data: a }));
    data.calls.forEach((c: any) => items.push({ t: c.created_at, kind: "call", data: c }));
    data.linkedinTasks.forEach((l: any) => items.push({ t: l.created_at, kind: "linkedin", data: l }));
    data.appointments.forEach((a: any) => items.push({ t: a.scheduled_at, kind: "appointment", data: a }));
    return items.sort((a, b) => (b.t || "").localeCompare(a.t || ""));
  }, [data]);
  return (
    <Dialog open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{[data.lead.first_name, data.lead.last_name].filter(Boolean).join(" ") || "Lead"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Field label="Title" value={data.lead.title} />
              <Field label="Email" value={data.lead.email} />
              <Field label="Phone" value={data.lead.phone} />
              <Field label="LinkedIn" value={data.lead.linkedin_url} />
              <Field label="Company" value={(data.lead as any).company?.name} />
              <Field label="City" value={(data.lead as any).company?.city} />
              <Field label="Niche" value={(data.lead as any).company?.niche} />
              <Field label="Owner" value={setterName(data.lead.owner_setter_id)} />
              <Field label="Status" value={data.lead.status} />
              <Field label="Email status" value={data.lead.email_status} />
            </div>
            {data.lead.selection_reason && (
              <div className="mt-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Selection reason</div>
                {data.lead.selection_reason}
              </div>
            )}
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Timeline</div>
              <div className="max-h-80 overflow-y-auto divide-y divide-border border border-border rounded-md">
                {timeline.length === 0 && <div className="p-3 text-sm text-muted-foreground">No activity yet.</div>}
                {timeline.map((it, i) => (
                  <div key={i} className="p-2 text-xs">
                    <span className="text-muted-foreground">{it.t ? new Date(it.t).toLocaleString() : "—"}</span>
                    {" · "}
                    <span className="uppercase">{it.kind}</span>
                    {" · "}
                    <span>{it.kind === "activity" ? `${it.data.type} — ${it.data.detail ?? ""}` :
                      it.kind === "call" ? `${it.data.outcome}${it.data.notes ? " — " + it.data.notes : ""}` :
                      it.kind === "linkedin" ? `${it.data.task_type} (${it.data.status})` :
                      `${it.data.status}${it.data.outcome_notes ? " — " + it.data.outcome_notes : ""}`}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate text-sm">{value || "—"}</div>
    </div>
  );
}
