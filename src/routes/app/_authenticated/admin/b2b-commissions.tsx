import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listB2BCommissions, addB2BCommission, recordPayout, undoPayout, type B2BCommissionGroup, type B2BCommissionEntry } from "@/lib/api/b2b-commissions.functions";
import { approveCommission, updateCommission, deleteCommission } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, CheckCircle2, Pencil, Trash2, Wallet, Clock, CalendarIcon } from "lucide-react";
import { toast } from "sonner";


const opts = queryOptions({ queryKey: ["b2b-commissions"], queryFn: () => listB2BCommissions() });

export const Route = createFileRoute("/app/_authenticated/admin/b2b-commissions")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: B2BCommissions,
});

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString() : "—");

function B2BCommissions() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [payoutsOpen, setPayoutsOpen] = useState(false);

  // filters for "All entries" — default to last 30 days
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const defaultFrom = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() - 30); return d; }, [today]);
  const [from, setFrom] = useState<Date | undefined>(defaultFrom);
  const [to, setTo] = useState<Date | undefined>(today);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["b2b-commissions"] });

  const pending = data.groups.filter((g) => g.status !== "approved");
  const filteredGroups = useMemo(() => {
    let g = data.groups.slice();
    if (from) g = g.filter((x) => new Date(x.created_at) >= from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      g = g.filter((x) => new Date(x.created_at) <= end);
    }
    g.sort((a, b) => (sortDir === "desc" ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)));
    return g;
  }, [data.groups, from, to, sortDir]);

  const fmtBtn = (d: Date | undefined) =>
    d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Pick date";



  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title="B2B Commissions" description="Setter and closer commissions from B2B deals." />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPayoutsOpen(true)}>
            <Wallet className="h-4 w-4 mr-1" /> Payouts
          </Button>
          <Button onClick={() => setAddOpen(true)} size="icon" aria-label="Add commission">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {pending.length > 0 && (
        <Card className="border-warning/40">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-display font-semibold">Pending approval</h3>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {pending.map((g) => (
              <GroupCard key={g.key} group={g} onChanged={invalidate} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-semibold">All entries</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-[150px] justify-start font-normal">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {fmtBtn(from)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={from} onSelect={setFrom} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-[150px] justify-start font-normal">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {fmtBtn(to)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={to} onSelect={setTo} />
                </PopoverContent>
              </Popover>
            </div>
            <Select value={sortDir} onValueChange={(v) => setSortDir(v as "desc" | "asc")}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Newest first</SelectItem>
                <SelectItem value="asc">Oldest first</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => { setFrom(defaultFrom); setTo(today); }}>Reset</Button>
          </div>

        </div>
        {filteredGroups.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No entries in this range.</div>
        ) : (
          <div className="divide-y divide-border">
            {filteredGroups.map((g) => (
              <GroupCard key={g.key} group={g} onChanged={invalidate} />
            ))}
          </div>
        )}
      </Card>

      <AddDialog open={addOpen} onOpenChange={setAddOpen} setters={data.setters} closers={data.closers} onAdded={invalidate} />
      <PayoutsSheet open={payoutsOpen} onOpenChange={setPayoutsOpen} entries={data.entries} />
    </div>
  );
}

function GroupCard({ group, onChanged }: { group: B2BCommissionGroup; onChanged: () => void }) {
  const total = (group.setter?.amount ?? 0) + (group.closer?.amount ?? 0) + group.extras.reduce((s, e) => s + e.amount, 0);
  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{group.appointment_name ?? "Manual entry"}</span>
            {group.status === "pending" && <Badge variant="outline" className="border-warning text-warning text-[10px]">Pending</Badge>}
            {group.status === "approved" && <Badge variant="outline" className="border-success text-success text-[10px]">Approved</Badge>}
            {group.status === "mixed" && <Badge variant="outline" className="text-[10px]">Partly approved</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {fmtDate(group.created_at)}
            {group.deal_amount != null ? ` · Deal ${money(group.deal_amount)}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
          <div className="font-semibold text-success">{money(total)}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <EntrySlot label="Setter" entry={group.setter} onChanged={onChanged} />
        <EntrySlot label="Closer" entry={group.closer} onChanged={onChanged} />
      </div>
      {group.extras.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2">
          {group.extras.map((e) => (
            <EntrySlot key={e.id} label={e.role ? e.role[0].toUpperCase() + e.role.slice(1) : "Entry"} entry={e} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntrySlot({ label, entry, onChanged }: { label: string; entry: B2BCommissionEntry | null; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [deal, setDeal] = useState(entry?.deal_amount != null ? String(entry.deal_amount) : "");
  const [pct, setPct] = useState(entry?.commission_percent != null ? String(entry.commission_percent) : "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");

  const approve = useMutation({
    mutationFn: (id: string) => approveCommission({ data: { id } }),
    onSuccess: () => { toast.success("Approved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteCommission({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: () => updateCommission({
      data: {
        id: entry!.id,
        amount: amount ? parseFloat(amount) : undefined,
        commission_percent: pct ? parseFloat(pct) : null,
        deal_amount: deal ? parseFloat(deal) : null,
      },
    }),
    onSuccess: () => { toast.success("Updated"); setEditing(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!entry) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <div className="uppercase tracking-widest text-[10px]">{label}</div>
        <div className="mt-1">Not recorded</div>
      </div>
    );
  }

  const isPending = entry.status === "pending";

  return (
    <div className="rounded-md border border-border p-3 space-y-2 bg-muted/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="font-medium truncate">{entry.user_name}</div>
          <div className="text-[11px] text-muted-foreground">
            {entry.commission_percent != null ? `${entry.commission_percent}%` : "—"}
            {entry.deal_amount != null ? ` of ${money(entry.deal_amount)}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-semibold ${isPending ? "text-warning" : "text-success"}`}>{money(entry.amount)}</div>
          {isPending ? <Clock className="h-3 w-3 inline text-warning" /> : <CheckCircle2 className="h-3 w-3 inline text-success" />}
        </div>
      </div>

      {editing && (
        <div className="grid grid-cols-3 gap-1">
          <div><Label className="text-[9px]">Deal</Label><Input className="h-8" type="number" step="0.01" value={deal} onChange={(e) => {
            const v = e.target.value; setDeal(v);
            const d = parseFloat(v); const p = parseFloat(pct);
            if (isFinite(d) && isFinite(p)) setAmount((Math.round(d * p) / 100).toFixed(2));
          }} /></div>
          <div><Label className="text-[9px]">%</Label><Input className="h-8" type="number" step="0.01" value={pct} onChange={(e) => {
            const v = e.target.value; setPct(v);
            const d = parseFloat(deal); const p = parseFloat(v);
            if (isFinite(d) && isFinite(p)) setAmount((Math.round(d * p) / 100).toFixed(2));
          }} /></div>
          <div><Label className="text-[9px]">Owed</Label><Input className="h-8" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </div>
      )}

      <div className="flex gap-1 justify-end">
        {isPending && !editing && (
          <Button size="sm" className="h-7" onClick={() => approve.mutate(entry.id)}>
            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
          </Button>
        )}
        {editing ? (
          <>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="h-7" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => confirm("Remove this entry?") && del.mutate(entry.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function AddDialog({ open, onOpenChange, setters, closers, onAdded }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  setters: Array<{ user_id: string; name: string }>;
  closers: Array<{ user_id: string; name: string }>;
  onAdded: () => void;
}) {
  const [deal, setDeal] = useState("");
  const [setterId, setSetterId] = useState<string>("");
  const [setterPct, setSetterPct] = useState<string>("10");
  const [closerId, setCloserId] = useState<string>("");
  const [closerPct, setCloserPct] = useState<string>("15");
  const [note, setNote] = useState("");

  const reset = () => { setDeal(""); setSetterId(""); setSetterPct("10"); setCloserId(""); setCloserPct("15"); setNote(""); };

  const submit = useMutation({
    mutationFn: () => addB2BCommission({
      data: {
        deal_amount: parseFloat(deal) || 0,
        setter_user_id: setterId || null,
        setter_percent: setterId ? parseFloat(setterPct) || 0 : null,
        closer_user_id: closerId || null,
        closer_percent: closerId ? parseFloat(closerPct) || 0 : null,
        note: note || null,
      },
    }),
    onSuccess: () => { toast.success("Commission added"); reset(); onAdded(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = parseFloat(deal);
  const sAmt = setterId && isFinite(d) ? Math.round(d * (parseFloat(setterPct) || 0)) / 100 : 0;
  const cAmt = closerId && isFinite(d) ? Math.round(d * (parseFloat(closerPct) || 0)) / 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add commission</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Deal amount ($)</Label>
            <Input type="number" step="0.01" value={deal} onChange={(e) => setDeal(e.target.value)} placeholder="0.00" />
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Setter</div>
              {sAmt > 0 && <div className="text-xs text-success">{money(sAmt)}</div>}
            </div>
            <Select value={setterId} onValueChange={setSetterId}>
              <SelectTrigger><SelectValue placeholder="Assign a setter (optional)" /></SelectTrigger>
              <SelectContent>
                {setters.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {setterId && (
              <div>
                <Label className="text-[10px]">Setter %</Label>
                <Input type="number" step="0.01" value={setterPct} onChange={(e) => setSetterPct(e.target.value)} />
              </div>
            )}
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Closer</div>
              {cAmt > 0 && <div className="text-xs text-success">{money(cAmt)}</div>}
            </div>
            <Select value={closerId} onValueChange={setCloserId}>
              <SelectTrigger><SelectValue placeholder="Assign a closer (optional)" /></SelectTrigger>
              <SelectContent>
                {closers.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {closerId && (
              <div>
                <Label className="text-[10px]">Closer %</Label>
                <Input type="number" step="0.01" value={closerPct} onChange={(e) => setCloserPct(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !deal || (!setterId && !closerId)}
          >
            {submit.isPending ? "Adding…" : "Add commission"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayoutsSheet({ open, onOpenChange, entries }: { open: boolean; onOpenChange: (v: boolean) => void; entries: B2BCommissionEntry[] }) {
  const grouped = useMemo(() => {
    const m = new Map<string, { user_id: string; name: string; approved: number; pending: number; rows: B2BCommissionEntry[] }>();
    for (const e of entries) {
      const g = m.get(e.user_id) ?? { user_id: e.user_id, name: e.user_name, approved: 0, pending: 0, rows: [] };
      if (e.status === "approved") g.approved += e.amount;
      else g.pending += e.amount;
      g.rows.push(e);
      m.set(e.user_id, g);
    }
    return Array.from(m.values()).sort((a, b) => (b.approved + b.pending) - (a.approved + a.pending));
  }, [entries]);

  const grandApproved = grouped.reduce((s, g) => s + g.approved, 0);
  const grandPending = grouped.reduce((s, g) => s + g.pending, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Payouts</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Approved owed</div>
              <div className="text-xl font-semibold text-success">{money(grandApproved)}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending owed</div>
              <div className="text-xl font-semibold text-warning">{money(grandPending)}</div>
            </Card>
          </div>

          {grouped.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">No commissions yet.</Card>
          )}

          {grouped.map((g) => (
            <Card key={g.user_id} className="overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{g.name}</div>
                  <div className="text-[11px] text-muted-foreground">{g.rows.length} deal{g.rows.length === 1 ? "" : "s"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Owed</div>
                  <div className="font-semibold">{money(g.approved + g.pending)}</div>
                  <div className="text-[10px] text-muted-foreground">
                    <span className="text-success">{money(g.approved)}</span> approved · <span className="text-warning">{money(g.pending)}</span> pending
                  </div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {g.rows.map((r) => (
                  <div key={r.id} className="p-2 px-3 text-sm flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px]">
                        {r.note || (r.role ? `${r.role} commission` : "Commission")}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtDate(r.created_at)}
                        {r.commission_percent != null ? ` · ${r.commission_percent}%` : ""}
                        {r.deal_amount != null ? ` of ${money(r.deal_amount)}` : ""}
                      </div>
                    </div>
                    <div className={`font-medium ${r.status === "approved" ? "text-success" : "text-warning"}`}>{money(r.amount)}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
