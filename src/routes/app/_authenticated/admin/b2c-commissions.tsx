import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import {
  listClosedDealsForCommission,
  updateBookingCommission,
  clearBookingOutcome,
  approveBookingCommission,
  recordB2cCommissionPayout,
  undoB2cCommissionPayout,
} from "@/lib/api/b2c.functions";
import { PageHeader } from "@/components/ui-bits";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { DollarSign, Percent, Trash2, Wallet, Plus, CheckCircle2, Clock, CalendarIcon, Pencil } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/admin/b2c-commissions")({
  component: B2cCommissionsPage,
});

type Row = {
  id: string;
  applicant_name: string;
  applicant_email: string;
  slot_start: string;
  outcome: string;
  outcome_at: string | null;
  deal_amount: number | null;
  deposit_amount: number | null;
  follow_up_amount: number | null;
  commission_percent: number | null;
  commission_amount: number | null;
  commission_status?: string | null;
  commission_paid_at?: string | null;
  commission_payout_note?: string | null;
  closers: { id: string; full_name: string; email: string } | null;
  dm_setter_id?: string | null;
  dm_setter_commission_amount?: number | null;
  dm_setter_commission_status?: string | null;
  dm_setter_commission_paid_at?: string | null;
  dm_setter?: { id: string; full_name: string; user_id: string | null } | null;
  dm_setter_manager_id?: string | null;
  dm_setter_manager_commission_amount?: number | null;
  dm_setter_manager_commission_status?: string | null;
  dm_setter_manager_commission_paid_at?: string | null;
  dm_setter_manager?: { id: string; full_name: string; user_id: string | null } | null;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString() : "—");

const dealVolume = (r: Row) =>
  Number(r.deal_amount ?? 0) + Number(r.deposit_amount ?? 0) + Number(r.follow_up_amount ?? 0);

function B2cCommissionsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["closed-deals-commission"],
    queryFn: () => listClosedDealsForCommission(),
  });
  const rows = data as Row[];

  const [payoutsOpen, setPayoutsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Date range — default last 30 days
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const defaultFrom = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() - 30); return d; }, [today]);
  const [from, setFrom] = useState<Date | undefined>(defaultFrom);
  const [to, setTo] = useState<Date | undefined>(today);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const dateOf = (r: Row) => r.outcome_at ?? "";

  const pending = useMemo(
    () => rows.filter((r) => (r.commission_status ?? "pending") !== "approved" && r.closers && Number(r.commission_amount ?? 0) > 0),
    [rows],
  );

  const filtered = useMemo(() => {
    let g = rows.slice();
    if (from) g = g.filter((x) => x.outcome_at && new Date(x.outcome_at) >= from);
    if (to) {
      const end = new Date(to); end.setHours(23, 59, 59, 999);
      g = g.filter((x) => x.outcome_at && new Date(x.outcome_at) <= end);
    }
    g.sort((a, b) => sortDir === "desc" ? dateOf(b).localeCompare(dateOf(a)) : dateOf(a).localeCompare(dateOf(b)));
    return g;
  }, [rows, from, to, sortDir]);

  const fmtBtn = (d: Date | undefined) =>
    d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Pick date";

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title="B2C Commissions" description="DM setter and closer commissions from B2C deals." />
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
            {pending.map((r) => <BookingGroupCard key={r.id} row={r} />)}
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
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No entries in this range.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => <BookingGroupCard key={r.id} row={r} />)}
          </div>
        )}
      </Card>

      <PayoutsSheet open={payoutsOpen} onOpenChange={setPayoutsOpen} rows={rows} />
      <AddDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

// ---------- Booking group card (DM Setter | Closer) ----------
function BookingGroupCard({ row }: { row: Row }) {
  const [editing, setEditing] = useState(false);
  const isApproved = (row.commission_status ?? "pending") === "approved";
  const isPaid = !!row.commission_paid_at;
  const total = Number(row.commission_amount ?? 0);

  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{row.applicant_name}</span>
            <Badge variant={row.outcome === "closed" ? "default" : "secondary"} className="capitalize text-[10px]">{row.outcome}</Badge>
            {isApproved
              ? <Badge variant="outline" className="border-success text-success text-[10px]">Approved</Badge>
              : <Badge variant="outline" className="border-warning text-warning text-[10px]">Pending</Badge>}
            {isPaid && <Badge variant="outline" className="border-success text-success text-[10px]">Paid</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {fmtDate(row.outcome_at)}
            {dealVolume(row) > 0 ? ` · Deal ${money(dealVolume(row))}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
          <div className={`font-semibold ${isApproved ? "text-success" : "text-warning"}`}>{money(total)}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {/* DM Setter — structure ready for future data */}
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          <div className="uppercase tracking-widest text-[10px]">DM Setter</div>
          <div className="mt-1">Not recorded</div>
        </div>

        {/* Closer slot */}
        <CloserSlot row={row} editing={editing} setEditing={setEditing} />
      </div>
    </div>
  );
}

function CloserSlot({ row, editing, setEditing }: { row: Row; editing: boolean; setEditing: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [deal, setDeal] = useState(String(row.deal_amount ?? ""));
  const [deposit, setDeposit] = useState(String(row.deposit_amount ?? ""));
  const [followUp, setFollowUp] = useState(String(row.follow_up_amount ?? ""));
  const [pct, setPct] = useState<string>(row.commission_percent != null ? String(row.commission_percent) : "");
  const [override, setOverride] = useState(String(row.commission_amount ?? ""));
  const [useOverride, setUseOverride] = useState(false);

  useEffect(() => {
    setDeal(String(row.deal_amount ?? ""));
    setDeposit(String(row.deposit_amount ?? ""));
    setFollowUp(String(row.follow_up_amount ?? ""));
    setPct(row.commission_percent != null ? String(row.commission_percent) : "");
    setOverride(String(row.commission_amount ?? ""));
    setUseOverride(false);
  }, [row.id, row.commission_amount, row.commission_percent, row.deal_amount, row.deposit_amount, row.follow_up_amount]);

  const computed = (() => {
    const p = parseFloat(pct);
    if (!p) return null;
    let base = 0;
    if (row.outcome === "closed") base = parseFloat(deal) || 0;
    else if (row.outcome === "deposit") base = (parseFloat(deposit) || 0) + (parseFloat(followUp) || 0);
    if (base <= 0) return null;
    return Math.round(base * (p / 100) * 100) / 100;
  })();

  const save = useMutation({
    mutationFn: () => updateBookingCommission({
      data: {
        booking_id: row.id,
        deal_amount: row.outcome === "closed" ? (parseFloat(deal) || 0) : null,
        deposit_amount: row.outcome === "deposit" ? (parseFloat(deposit) || 0) : null,
        follow_up_amount: row.outcome === "deposit" ? (parseFloat(followUp) || 0) : null,
        commission_percent: pct ? parseFloat(pct) : null,
        commission_amount: useOverride && override ? parseFloat(override) : undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Commission updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
      qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      await updateBookingCommission({
        data: {
          booking_id: row.id,
          deal_amount: row.outcome === "closed" ? (parseFloat(deal) || 0) : null,
          deposit_amount: row.outcome === "deposit" ? (parseFloat(deposit) || 0) : null,
          follow_up_amount: row.outcome === "deposit" ? (parseFloat(followUp) || 0) : null,
          commission_percent: pct ? parseFloat(pct) : null,
          commission_amount: useOverride && override ? parseFloat(override) : undefined,
        },
      });
      return approveBookingCommission({ data: { booking_id: row.id } });
    },
    onSuccess: () => {
      toast.success("Commission approved");
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
      qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
      qc.invalidateQueries({ queryKey: ["closer-detail"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isApproved = (row.commission_status ?? "pending") === "approved";
  const isPending = !isApproved;

  if (!row.closers) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <div className="uppercase tracking-widest text-[10px]">Closer</div>
        <div className="mt-1">Unassigned</div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2 bg-muted/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Closer</div>
          <div className="font-medium truncate">{row.closers.full_name}</div>
          <div className="text-[11px] text-muted-foreground">
            {row.commission_percent != null ? `${row.commission_percent}%` : "—"}
            {dealVolume(row) > 0 ? ` of ${money(dealVolume(row))}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-semibold ${isPending ? "text-warning" : "text-success"}`}>{money(row.commission_amount)}</div>
          {isPending ? <Clock className="h-3 w-3 inline text-warning" /> : <CheckCircle2 className="h-3 w-3 inline text-success" />}
        </div>
      </div>

      {editing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
          {row.outcome === "closed" && (
            <div>
              <Label className="text-[9px]">Deal ($)</Label>
              <Input className="h-8" type="number" step="0.01" value={deal} onChange={(e) => setDeal(e.target.value)} />
            </div>
          )}
          {row.outcome === "deposit" && (
            <>
              <div>
                <Label className="text-[9px]">Deposit ($)</Label>
                <Input className="h-8" type="number" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              </div>
              <div>
                <Label className="text-[9px]">Follow-up ($)</Label>
                <Input className="h-8" type="number" step="0.01" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <Label className="text-[9px] flex items-center gap-1"><Percent className="h-3 w-3" /> %</Label>
            <Select value={pct} onValueChange={setPct}>
              <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="15">15%</SelectItem>
                <SelectItem value="20">20%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[9px] flex items-center gap-1"><DollarSign className="h-3 w-3" /> Override</Label>
            <Input
              className="h-8"
              type="number"
              step="0.01"
              value={override}
              placeholder={computed != null ? String(computed) : ""}
              onChange={(e) => { setOverride(e.target.value); setUseOverride(true); }}
            />
          </div>
        </div>
      )}

      {editing && (
        <div className="text-[10px] text-muted-foreground">
          {computed != null ? <>Computed: <span className="text-foreground">{money(computed)}</span></> : "Pick a percentage to compute"}
          {useOverride && override && <span className="ml-2">· Override active</span>}
        </div>
      )}

      <div className="flex gap-1 justify-end">
        {isPending && !editing && (
          <Button size="sm" className="h-7" onClick={() => approve.mutate()} disabled={approve.isPending}>
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
        <DeleteCommissionButton bookingId={row.id} name={row.applicant_name} />
      </div>
    </div>
  );
}

function DeleteCommissionButton({ bookingId, name }: { bookingId: string; name: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => clearBookingOutcome({ data: { booking_id: bookingId } }),
    onSuccess: () => {
      toast.success("Commission removed");
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
      qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this commission?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the commission and clears the outcome on <strong>{name}</strong>'s booking. The booking itself stays, but it will no longer appear in the commissions list. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={del.isPending}
            onClick={(e) => { e.preventDefault(); del.mutate(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Add commission dialog (placeholder for DM setter structure) ----------
function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add commission</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 space-y-2 opacity-60">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">DM Setter</div>
            <Select disabled>
              <SelectTrigger><SelectValue placeholder="No DM setters yet — coming soon" /></SelectTrigger>
              <SelectContent />
            </Select>
          </div>
          <div className="rounded-md border border-border p-3 space-y-2 opacity-60">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Closer</div>
            <Select disabled>
              <SelectTrigger><SelectValue placeholder="Manual entry coming soon" /></SelectTrigger>
              <SelectContent />
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            B2C commissions are auto-created when a closer logs a "closed" or "deposit" outcome. Manual B2C entries will unlock once DM setters are added.
          </p>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Payouts Sheet (mirrors B2B) ----------
type PayoutBucket = "unpaid" | "paid";

function PayoutsSheet({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (v: boolean) => void; rows: Row[] }) {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<PayoutBucket | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  const approved = useMemo(
    () => rows.filter((r) => (r.commission_status ?? "pending") === "approved" && r.closers && Number(r.commission_amount ?? 0) > 0),
    [rows],
  );
  const unpaid = useMemo(() => approved.filter((r) => !r.commission_paid_at), [approved]);
  const paid = useMemo(() => approved.filter((r) => !!r.commission_paid_at), [approved]);

  const totalUnpaid = unpaid.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);
  const totalPaid = paid.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);

  const groupByCloser = (list: Row[]) => {
    const m = new Map<string, { closer_id: string; name: string; total: number; rows: Row[] }>();
    for (const r of list) {
      if (!r.closers) continue;
      const g = m.get(r.closers.id) ?? { closer_id: r.closers.id, name: r.closers.full_name, total: 0, rows: [] };
      g.total += Number(r.commission_amount ?? 0);
      g.rows.push(r);
      m.set(r.closers.id, g);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  };

  const bucketList = bucket === "unpaid" ? unpaid : bucket === "paid" ? paid : [];
  const bucketGroups = useMemo(() => groupByCloser(bucketList), [bucketList]);

  const undo = useMutation({
    mutationFn: (id: string) => undoB2cCommissionPayout({ data: { booking_ids: [id] } }),
    onSuccess: () => {
      toast.success("Marked unpaid");
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
      qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [payTarget, setPayTarget] = useState<{ closer_id: string; name: string; total: number; ids: string[] } | null>(null);
  const [payNote, setPayNote] = useState("");

  const payAll = useMutation({
    mutationFn: (args: { ids: string[]; note: string | null }) => recordB2cCommissionPayout({ data: { booking_ids: args.ids, note: args.note } }),
    onSuccess: () => {
      toast.success("Payout recorded");
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
      qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
      setPayTarget(null);
      setPayNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>Payouts</SheetTitle>
              <Button size="sm" onClick={() => setRecordOpen(true)} disabled={unpaid.length === 0}>
                <Wallet className="h-4 w-4 mr-1" /> Record payout
              </Button>
            </div>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setBucket(bucket === "unpaid" ? null : "unpaid")} className="text-left">
                <Card className={`p-3 hover:border-warning/60 transition-colors ${bucket === "unpaid" ? "border-warning/70 ring-1 ring-warning/40" : ""}`}>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Not Paid Out</div>
                  <div className="text-xl font-semibold text-warning">{money(totalUnpaid)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{unpaid.length} entr{unpaid.length === 1 ? "y" : "ies"} · tap to {bucket === "unpaid" ? "hide" : "view"}</div>
                </Card>
              </button>
              <button type="button" onClick={() => setBucket(bucket === "paid" ? null : "paid")} className="text-left">
                <Card className={`p-3 hover:border-success/60 transition-colors ${bucket === "paid" ? "border-success/70 ring-1 ring-success/40" : ""}`}>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Paid Out</div>
                  <div className="text-xl font-semibold text-success">{money(totalPaid)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{paid.length} entr{paid.length === 1 ? "y" : "ies"} · tap to {bucket === "paid" ? "hide" : "view"}</div>
                </Card>
              </button>
            </div>

            {approved.length === 0 && (
              <Card className="p-6 text-center text-sm text-muted-foreground">No approved commissions yet.</Card>
            )}

            {bucket !== null && (
              <div className="space-y-3">
                {bucketGroups.length === 0 && (
                  <Card className="p-6 text-center text-sm text-muted-foreground">Nothing here.</Card>
                )}
                {bucketGroups.map((g) => (
                  <Card key={g.closer_id} className="overflow-hidden">
                    <div className="p-3 border-b border-border flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{g.name}</div>
                        <div className="text-[11px] text-muted-foreground">{g.rows.length} entr{g.rows.length === 1 ? "y" : "ies"}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{bucket === "unpaid" ? "Owed" : "Paid"}</div>
                          <div className={`font-semibold ${bucket === "unpaid" ? "text-warning" : "text-success"}`}>{money(g.total)}</div>
                        </div>
                        {bucket === "unpaid" && (
                          <Button
                            size="sm"
                            onClick={() => { setPayTarget({ closer_id: g.closer_id, name: g.name, total: g.total, ids: g.rows.map((r) => r.id) }); setPayNote(""); }}
                            disabled={payAll.isPending}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-1" /> Pay out
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {g.rows.map((r) => (
                        <div key={r.id} className="p-2 px-3 text-sm flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13px]">{r.applicant_name} · <span className="capitalize">{r.outcome}</span></div>
                            <div className="text-[10px] text-muted-foreground">
                              {fmtDate(r.outcome_at)}
                              {r.commission_percent != null ? ` · ${r.commission_percent}%` : ""}
                              {dealVolume(r) > 0 ? ` of ${money(dealVolume(r))}` : ""}
                              {r.commission_paid_at ? ` · paid ${fmtDate(r.commission_paid_at)}` : ""}
                              {r.commission_payout_note ? ` · ${r.commission_payout_note}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`font-medium ${bucket === "unpaid" ? "text-warning" : "text-success"}`}>{money(r.commission_amount)}</div>
                            {bucket === "paid" && (
                              <Button size="sm" variant="ghost" onClick={() => undo.mutate(r.id)} disabled={undo.isPending}>Undo</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={payTarget !== null} onOpenChange={(o) => { if (!o) { setPayTarget(null); setPayNote(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Pay out {payTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Marking <span className="font-semibold text-foreground">{money(payTarget?.total ?? 0)}</span> across {payTarget?.ids.length ?? 0} entr{(payTarget?.ids.length ?? 0) === 1 ? "y" : "ies"} as paid.
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea rows={3} value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. Venmo, ref #1234" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button
              onClick={() => payTarget && payAll.mutate({ ids: payTarget.ids, note: payNote || null })}
              disabled={payAll.isPending}
            >
              {payAll.isPending ? "Recording…" : "Confirm payout"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <RecordPayoutDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        unpaidGroups={groupByCloser(unpaid)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
          qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
        }}
      />
    </>
  );
}

function RecordPayoutDialog({
  open,
  onOpenChange,
  unpaidGroups,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unpaidGroups: Array<{ closer_id: string; name: string; total: number; rows: Row[] }>;
  onDone: () => void;
}) {
  const [closerId, setCloserId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const activeGroup = unpaidGroups.find((g) => g.closer_id === closerId);

  const pickCloser = (id: string) => {
    setCloserId(id);
    const g = unpaidGroups.find((x) => x.closer_id === id);
    setSelected(new Set(g?.rows.map((r) => r.id) ?? []));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTotal = activeGroup
    ? activeGroup.rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + Number(r.commission_amount ?? 0), 0)
    : 0;

  const submit = useMutation({
    mutationFn: () => recordB2cCommissionPayout({ data: { booking_ids: Array.from(selected), note: note || null } }),
    onSuccess: () => {
      toast.success("Payout recorded");
      setCloserId(""); setSelected(new Set()); setNote("");
      onDone();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setCloserId(""); setSelected(new Set()); setNote(""); } onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record a payout</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Recipient</Label>
            <Select value={closerId} onValueChange={pickCloser}>
              <SelectTrigger><SelectValue placeholder="Choose closer" /></SelectTrigger>
              <SelectContent>
                {unpaidGroups.map((g) => (
                  <SelectItem key={g.closer_id} value={g.closer_id}>
                    {g.name} — {money(g.total)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeGroup && (
            <div className="rounded-md border border-border divide-y divide-border max-h-64 overflow-y-auto">
              {activeGroup.rows.map((r) => (
                <label key={r.id} className="flex items-center gap-2 p-2 px-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[13px]">{r.applicant_name} · <span className="capitalize">{r.outcome}</span></div>
                    <div className="text-[10px] text-muted-foreground">
                      {fmtDate(r.outcome_at)}
                      {r.commission_percent != null ? ` · ${r.commission_percent}%` : ""}
                      {dealVolume(r) > 0 ? ` of ${money(dealVolume(r))}` : ""}
                    </div>
                  </div>
                  <div className="font-medium text-warning">{money(r.commission_amount)}</div>
                </label>
              ))}
            </div>
          )}

          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Venmo, ref #1234" />
          </div>

          {activeGroup && (
            <div className="text-sm text-muted-foreground">
              Marking <span className="font-semibold text-foreground">{money(selectedTotal)}</span> as paid to <span className="font-semibold text-foreground">{activeGroup.name}</span>.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || selected.size === 0}>
            {submit.isPending ? "Recording…" : "Record payout"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
