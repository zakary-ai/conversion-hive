import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import {
  listClosedDealsForCommission,
  updateBookingCommission,
  clearBookingOutcome,
  approveBookingCommission,
  approveDmSetterCommission,
  recordB2cCommissionPayout,
  undoB2cCommissionPayout,
  listB2cManualLookups,
  addB2cManualCommission,
  listB2cManualCommissions,
} from "@/lib/api/b2c.functions";
import { approveCommission, deleteCommission, setCommissionPaid } from "@/lib/api/cl.functions";

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
    () => rows.filter((r) => {
      const closerPending = r.closers && Number(r.commission_amount ?? 0) > 0 && (r.commission_status ?? "pending") !== "approved";
      const dmPending = Number(r.dm_setter_commission_amount ?? 0) > 0 && (r.dm_setter_commission_status ?? "pending") !== "approved";
      const mgrPending = Number(r.dm_setter_manager_commission_amount ?? 0) > 0 && (r.dm_setter_manager_commission_status ?? "pending") !== "approved";
      return closerPending || dmPending || mgrPending;
    }),
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

      <ManualEntriesCard />

      <PayoutsSheetWithManual open={payoutsOpen} onOpenChange={setPayoutsOpen} rows={rows} />
      <AddDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function PayoutsSheetWithManual({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (v: boolean) => void; rows: Row[] }) {
  const { data: manual = [] } = useQuery({
    queryKey: ["b2c-manual-commissions"],
    queryFn: () => listB2cManualCommissions(),
    enabled: open,
  });
  return <PayoutsSheet open={open} onOpenChange={onOpenChange} rows={rows} manual={manual as ManualEntry[]} />;
}


// ---------- Booking group card (DM Setter | Closer) ----------
function BookingGroupCard({ row }: { row: Row }) {
  const [editing, setEditing] = useState(false);
  const closerApproved = (row.commission_status ?? "pending") === "approved";
  const dmApproved = (row.dm_setter_commission_status ?? "pending") === "approved";
  const mgrApproved = (row.dm_setter_manager_commission_status ?? "pending") === "approved";
  const isPaid = !!row.commission_paid_at;
  const closerAmt = Number(row.commission_amount ?? 0);
  const dmAmt = Number(row.dm_setter_commission_amount ?? 0);
  const mgrAmt = Number(row.dm_setter_manager_commission_amount ?? 0);
  const total = closerAmt + dmAmt + mgrAmt;
  const allApproved =
    (closerAmt === 0 || closerApproved) &&
    (dmAmt === 0 || dmApproved) &&
    (mgrAmt === 0 || mgrApproved);

  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{row.applicant_name}</span>
            <Badge variant={row.outcome === "closed" ? "default" : "secondary"} className="capitalize text-[10px]">{row.outcome}</Badge>
            {allApproved
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
          <div className={`font-semibold ${allApproved ? "text-success" : "text-warning"}`}>{money(total)}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <DmSetterSlot row={row} />
        <CloserSlot row={row} editing={editing} setEditing={setEditing} />
      </div>

      {mgrAmt > 0 && <DmManagerSlot row={row} />}
    </div>
  );
}

function DmSetterSlot({ row }: { row: Row }) {
  const qc = useQueryClient();
  const amount = Number(row.dm_setter_commission_amount ?? 0);
  const approved = (row.dm_setter_commission_status ?? "pending") === "approved";
  const deal = Number(row.deal_amount ?? 0);

  const approve = useMutation({
    mutationFn: () => approveDmSetterCommission({ data: { booking_id: row.id, role: "setter" } }),
    onSuccess: () => {
      toast.success("DM setter commission approved");
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!row.dm_setter || amount <= 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <div className="uppercase tracking-widest text-[10px]">DM Setter</div>
        <div className="mt-1">Not recorded</div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border p-3 space-y-2 bg-muted/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">DM Setter</div>
          <div className="font-medium truncate">{row.dm_setter.full_name}</div>
          <div className="text-[11px] text-muted-foreground">{deal > 0 ? `${((amount / deal) * 100).toFixed(((amount / deal) * 100) % 1 === 0 ? 0 : 1)}% of ${money(deal)}` : ""}</div>
        </div>
        <div className="text-right">
          <div className={`font-semibold ${approved ? "text-success" : "text-warning"}`}>{money(amount)}</div>
          {approved
            ? <CheckCircle2 className="h-3 w-3 inline text-success" />
            : <Clock className="h-3 w-3 inline text-warning" />}
        </div>
      </div>
      {!approved && (
        <div className="flex justify-end">
          <Button size="sm" className="h-7" onClick={() => approve.mutate()} disabled={approve.isPending}>
            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
          </Button>
        </div>
      )}
    </div>
  );
}

function DmManagerSlot({ row }: { row: Row }) {
  const qc = useQueryClient();
  const amount = Number(row.dm_setter_manager_commission_amount ?? 0);
  const approved = (row.dm_setter_manager_commission_status ?? "pending") === "approved";
  const deal = Number(row.deal_amount ?? 0);

  const approve = useMutation({
    mutationFn: () => approveDmSetterCommission({ data: { booking_id: row.id, role: "manager" } }),
    onSuccess: () => {
      toast.success("DM manager commission approved");
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-border p-3 space-y-2 bg-muted/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">DM Setter Manager</div>
          <div className="font-medium truncate">{row.dm_setter_manager?.full_name ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground">2.5%{deal > 0 ? ` of ${money(deal)}` : ""}</div>
        </div>
        <div className="text-right">
          <div className={`font-semibold ${approved ? "text-success" : "text-warning"}`}>{money(amount)}</div>
          {approved
            ? <CheckCircle2 className="h-3 w-3 inline text-success" />
            : <Clock className="h-3 w-3 inline text-warning" />}
        </div>
      </div>
      {!approved && (
        <div className="flex justify-end">
          <Button size="sm" className="h-7" onClick={() => approve.mutate()} disabled={approve.isPending}>
            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
          </Button>
        </div>
      )}
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

// ---------- Manual B2C commission entries (admin-added) ----------
type ManualEntry = Awaited<ReturnType<typeof listB2cManualCommissions>>[number];

const ROLE_LABEL: Record<string, string> = {
  dm_setter: "DM Setter",
  dm_manager: "DM Manager",
  closer_b2c: "Closer",
};

function ManualEntriesCard() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["b2c-manual-commissions"],
    queryFn: () => listB2cManualCommissions(),
  });
  const rows = data as ManualEntry[];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["b2c-manual-commissions"] });

  const approve = useMutation({
    mutationFn: (id: string) => approveCommission({ data: { id } }),
    onSuccess: () => { toast.success("Approved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteCommission({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const togglePaid = useMutation({
    mutationFn: (r: ManualEntry) =>
      r.paid_at
        ? setCommissionPaid({ data: { id: r.id, paid: false } })
        : setCommissionPaid({ data: { id: r.id, paid: true, paid_at: new Date().toISOString(), paid_method: "Manual" } }),
    onSuccess: () => { toast.success("Updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rows.length === 0) return null;

  return (
    <Card>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold">Manual entries</h3>
          <div className="text-xs text-muted-foreground">Admin-added B2C commissions.</div>
        </div>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => {
          const isPending = r.status !== "approved";
          const isPaid = !!r.paid_at;
          return (
            <div key={r.id} className="p-3 sm:p-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.deal_name || r.user_name}</span>
                  <Badge variant="outline" className="text-[10px]">{ROLE_LABEL[r.role] ?? r.role}</Badge>
                  {isPending
                    ? <Badge variant="outline" className="border-warning text-warning text-[10px]">Pending</Badge>
                    : <Badge variant="outline" className="border-success text-success text-[10px]">Approved</Badge>}
                  {isPaid && <Badge variant="outline" className="border-success text-success text-[10px]">Paid</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {r.deal_name ? `${r.user_name} · ` : ""}
                  {fmtDate(r.created_at)}
                  {r.commission_percent != null ? ` · ${r.commission_percent}%` : ""}
                  {r.deal_amount != null ? ` of ${money(r.deal_amount)}` : ""}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`font-semibold ${isPending ? "text-warning" : "text-success"}`}>{money(r.amount)}</div>
                {isPending && (
                  <Button size="sm" className="h-7" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                  </Button>
                )}
                {!isPending && (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => togglePaid.mutate(r)} disabled={togglePaid.isPending}>
                    <Wallet className="h-3 w-3 mr-1" /> {isPaid ? "Unmark paid" : "Mark paid"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => confirm("Remove this entry?") && del.mutate(r.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- Add commission dialog (manual DM setter / manager / closer entries) ----------
function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: lookups } = useQuery({
    queryKey: ["b2c-manual-lookups"],
    queryFn: () => listB2cManualLookups(),
    enabled: open,
  });

  const [deal, setDeal] = useState("");
  const [dealName, setDealName] = useState("");
  const [note, setNote] = useState("");
  const [setterId, setSetterId] = useState("");
  const [setterPct, setSetterPct] = useState("10");
  const [managerId, setManagerId] = useState("");
  const [managerPct, setManagerPct] = useState("2.5");
  const [closerId, setCloserId] = useState("");
  const [closerPct, setCloserPct] = useState("15");

  const reset = () => {
    setDeal(""); setDealName(""); setNote("");
    setSetterId(""); setSetterPct("10");
    setManagerId(""); setManagerPct("2.5");
    setCloserId(""); setCloserPct("15");
  };

  const d = parseFloat(deal);
  const calc = (pct: string) => (isFinite(d) && d > 0 ? Math.round(d * (parseFloat(pct) || 0)) / 100 : 0);
  const sAmt = setterId ? calc(setterPct) : 0;
  const mAmt = managerId ? calc(managerPct) : 0;
  const cAmt = closerId ? calc(closerPct) : 0;

  const submit = useMutation({
    mutationFn: () => {
      const entries: Array<{ role: "dm_setter" | "dm_manager" | "closer_b2c"; user_id: string; amount: number; commission_percent: number | null }> = [];
      if (setterId) entries.push({ role: "dm_setter", user_id: setterId, amount: sAmt, commission_percent: parseFloat(setterPct) || null });
      if (managerId) entries.push({ role: "dm_manager", user_id: managerId, amount: mAmt, commission_percent: parseFloat(managerPct) || null });
      if (closerId) entries.push({ role: "closer_b2c", user_id: closerId, amount: cAmt, commission_percent: parseFloat(closerPct) || null });
      return addB2cManualCommission({
        data: {
          deal_amount: isFinite(d) && d > 0 ? d : null,
          deal_name: dealName.trim() || null,
          entries,
          note: note || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Commission added");
      reset();
      qc.invalidateQueries({ queryKey: ["b2c-manual-commissions"] });
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = !!(setterId || managerId || closerId) && (sAmt + mAmt + cAmt) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add B2C commission</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Deal name</Label>
            <Input value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder="e.g. Jane Doe — Coaching package" />
          </div>
          <div>
            <Label>Deal amount ($)</Label>
            <Input type="number" step="0.01" value={deal} onChange={(e) => setDeal(e.target.value)} placeholder="0.00" />
            <div className="text-[10px] text-muted-foreground mt-1">Optional — used to auto-compute commissions by percentage.</div>
          </div>



          <ManualRoleBlock
            label="DM Setter"
            options={lookups?.dmSetters ?? []}
            userId={setterId}
            setUserId={setSetterId}
            pct={setterPct}
            setPct={setSetterPct}
            amount={sAmt}
          />
          <ManualRoleBlock
            label="DM Manager"
            options={lookups?.dmManagers ?? []}
            userId={managerId}
            setUserId={setManagerId}
            pct={managerPct}
            setPct={setManagerPct}
            amount={mAmt}
          />
          <ManualRoleBlock
            label="Closer"
            options={lookups?.closers ?? []}
            userId={closerId}
            setUserId={setCloserId}
            pct={closerPct}
            setPct={setCloserPct}
            amount={cAmt}
          />

          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !canSubmit}>
            {submit.isPending ? "Adding…" : "Add commission"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManualRoleBlock({
  label, options, userId, setUserId, pct, setPct, amount,
}: {
  label: string;
  options: Array<{ user_id: string; name: string }>;
  userId: string;
  setUserId: (v: string) => void;
  pct: string;
  setPct: (v: string) => void;
  amount: number;
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        {amount > 0 && <div className="text-xs text-success">{money(amount)}</div>}
      </div>
      <Select value={userId} onValueChange={setUserId}>
        <SelectTrigger>
          <SelectValue placeholder={options.length === 0 ? `No ${label.toLowerCase()}s available` : `Assign a ${label.toLowerCase()} (optional)`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.user_id} value={o.user_id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {userId && (
        <div>
          <Label className="text-[10px]">{label} %</Label>
          <Input type="number" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
      )}
    </div>
  );
}


// ---------- Payouts Sheet (bookings + approved manual entries) ----------
type PayoutBucket = "unpaid" | "paid";

type PayoutItem = {
  key: string;
  source: "booking" | "manual";
  id: string;
  recipient_key: string;
  recipient_name: string;
  amount: number;
  paid_at: string | null;
  paid_note: string | null;
  when: string | null;
  title: string;
  subtitle: string;
};

function PayoutsSheet({ open, onOpenChange, rows, manual }: { open: boolean; onOpenChange: (v: boolean) => void; rows: Row[]; manual: ManualEntry[] }) {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<PayoutBucket | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  const items = useMemo<PayoutItem[]>(() => {
    const out: PayoutItem[] = [];
    for (const r of rows) {
      if (!r.closers) continue;
      if ((r.commission_status ?? "pending") !== "approved") continue;
      const amt = Number(r.commission_amount ?? 0);
      if (amt <= 0) continue;
      out.push({
        key: `b:${r.id}`,
        source: "booking",
        id: r.id,
        recipient_key: `closer:${r.closers.id}`,
        recipient_name: r.closers.full_name,
        amount: amt,
        paid_at: r.commission_paid_at ?? null,
        paid_note: r.commission_payout_note ?? null,
        when: r.outcome_at ?? null,
        title: `${r.applicant_name} · ${r.outcome}`,
        subtitle: `${fmtDate(r.outcome_at)}${r.commission_percent != null ? ` · ${r.commission_percent}%` : ""}${dealVolume(r) > 0 ? ` of ${money(dealVolume(r))}` : ""}`,
      });
    }
    for (const m of manual) {
      if ((m.status ?? "pending") !== "approved") continue;
      const amt = Number(m.amount ?? 0);
      if (amt <= 0) continue;
      out.push({
        key: `m:${m.id}`,
        source: "manual",
        id: m.id,
        recipient_key: `user:${m.user_id}`,
        recipient_name: `${m.user_name} · ${ROLE_LABEL[m.role] ?? m.role}`,
        amount: amt,
        paid_at: m.paid_at ?? null,
        paid_note: m.paid_note ?? null,
        when: m.created_at,
        title: m.deal_name || m.user_name,
        subtitle: `${fmtDate(m.created_at)}${m.commission_percent != null ? ` · ${m.commission_percent}%` : ""}${m.deal_amount != null ? ` of ${money(m.deal_amount)}` : ""}${m.note ? ` · ${m.note}` : ""}`,
      });
    }
    return out;
  }, [rows, manual]);

  const unpaid = useMemo(() => items.filter((i) => !i.paid_at), [items]);
  const paid = useMemo(() => items.filter((i) => !!i.paid_at), [items]);
  const totalUnpaid = unpaid.reduce((s, i) => s + i.amount, 0);
  const totalPaid = paid.reduce((s, i) => s + i.amount, 0);

  const groupByRecipient = (list: PayoutItem[]) => {
    const m = new Map<string, { key: string; name: string; total: number; items: PayoutItem[] }>();
    for (const it of list) {
      const g = m.get(it.recipient_key) ?? { key: it.recipient_key, name: it.recipient_name, total: 0, items: [] };
      g.total += it.amount;
      g.items.push(it);
      m.set(it.recipient_key, g);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  };

  const bucketList = bucket === "unpaid" ? unpaid : bucket === "paid" ? paid : [];
  const bucketGroups = useMemo(() => groupByRecipient(bucketList), [bucketList]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
    qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
    qc.invalidateQueries({ queryKey: ["b2c-manual-commissions"] });
  };

  const setItemsPaid = async (list: PayoutItem[], note: string | null, paid: boolean) => {
    const bookingIds = list.filter((i) => i.source === "booking").map((i) => i.id);
    const manualIds = list.filter((i) => i.source === "manual").map((i) => i.id);
    if (bookingIds.length > 0) {
      if (paid) await recordB2cCommissionPayout({ data: { booking_ids: bookingIds, note } });
      else await undoB2cCommissionPayout({ data: { booking_ids: bookingIds } });
    }
    if (manualIds.length > 0) {
      const nowIso = new Date().toISOString();
      await Promise.all(manualIds.map((id) =>
        paid
          ? setCommissionPaid({ data: { id, paid: true, paid_at: nowIso, paid_method: note?.trim() || "Manual" } })
          : setCommissionPaid({ data: { id, paid: false } })
      ));
    }
  };

  const undo = useMutation({
    mutationFn: (it: PayoutItem) => setItemsPaid([it], null, false),
    onSuccess: () => { toast.success("Marked unpaid"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [payTarget, setPayTarget] = useState<{ name: string; total: number; items: PayoutItem[] } | null>(null);
  const [payNote, setPayNote] = useState("");

  const payAll = useMutation({
    mutationFn: (args: { items: PayoutItem[]; note: string | null }) => setItemsPaid(args.items, args.note, true),
    onSuccess: () => {
      toast.success("Payout recorded");
      invalidateAll();
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

            {items.length === 0 && (
              <Card className="p-6 text-center text-sm text-muted-foreground">No approved commissions yet.</Card>
            )}

            {bucket !== null && (
              <div className="space-y-3">
                {bucketGroups.length === 0 && (
                  <Card className="p-6 text-center text-sm text-muted-foreground">Nothing here.</Card>
                )}
                {bucketGroups.map((g) => (
                  <Card key={g.key} className="overflow-hidden">
                    <div className="p-3 border-b border-border flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{g.name}</div>
                        <div className="text-[11px] text-muted-foreground">{g.items.length} entr{g.items.length === 1 ? "y" : "ies"}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{bucket === "unpaid" ? "Owed" : "Paid"}</div>
                          <div className={`font-semibold ${bucket === "unpaid" ? "text-warning" : "text-success"}`}>{money(g.total)}</div>
                        </div>
                        {bucket === "unpaid" && (
                          <Button
                            size="sm"
                            onClick={() => { setPayTarget({ name: g.name, total: g.total, items: g.items }); setPayNote(""); }}
                            disabled={payAll.isPending}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-1" /> Pay out
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {g.items.map((it) => (
                        <div key={it.key} className="p-2 px-3 text-sm flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13px]">
                              {it.title}
                              {it.source === "manual" && <Badge variant="outline" className="ml-2 text-[9px]">Manual</Badge>}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {it.subtitle}
                              {it.paid_at ? ` · paid ${fmtDate(it.paid_at)}` : ""}
                              {it.paid_note ? ` · ${it.paid_note}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`font-medium ${bucket === "unpaid" ? "text-warning" : "text-success"}`}>{money(it.amount)}</div>
                            {bucket === "paid" && (
                              <Button size="sm" variant="ghost" onClick={() => undo.mutate(it)} disabled={undo.isPending}>Undo</Button>
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
              Marking <span className="font-semibold text-foreground">{money(payTarget?.total ?? 0)}</span> across {payTarget?.items.length ?? 0} entr{(payTarget?.items.length ?? 0) === 1 ? "y" : "ies"} as paid.
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea rows={3} value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. Venmo, ref #1234" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button
              onClick={() => payTarget && payAll.mutate({ items: payTarget.items, note: payNote || null })}
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
        unpaidGroups={groupByRecipient(unpaid)}
        onDone={invalidateAll}
        onPay={(items, note) => setItemsPaid(items, note, true)}
      />
    </>
  );
}

function RecordPayoutDialog({
  open,
  onOpenChange,
  unpaidGroups,
  onDone,
  onPay,
}: {

  open: boolean;
  onOpenChange: (v: boolean) => void;
  unpaidGroups: Array<{ key: string; name: string; total: number; items: PayoutItem[] }>;
  onDone: () => void;
  onPay: (items: PayoutItem[], note: string | null) => Promise<void>;
}) {
  const [groupKey, setGroupKey] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const activeGroup = unpaidGroups.find((g) => g.key === groupKey);

  const pick = (id: string) => {
    setGroupKey(id);
    const g = unpaidGroups.find((x) => x.key === id);
    setSelected(new Set(g?.items.map((i) => i.key) ?? []));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosen = activeGroup ? activeGroup.items.filter((i) => selected.has(i.key)) : [];
  const selectedTotal = chosen.reduce((s, i) => s + i.amount, 0);

  const submit = useMutation({
    mutationFn: () => onPay(chosen, note || null),
    onSuccess: () => {
      toast.success("Payout recorded");
      setGroupKey(""); setSelected(new Set()); setNote("");
      onDone();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setGroupKey(""); setSelected(new Set()); setNote(""); } onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record a payout</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Recipient</Label>
            <Select value={groupKey} onValueChange={pick}>
              <SelectTrigger><SelectValue placeholder="Choose recipient" /></SelectTrigger>
              <SelectContent>
                {unpaidGroups.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.name} — {money(g.total)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeGroup && (
            <div className="rounded-md border border-border divide-y divide-border max-h-64 overflow-y-auto">
              {activeGroup.items.map((it) => (
                <label key={it.key} className="flex items-center gap-2 p-2 px-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(it.key)}
                    onChange={() => toggle(it.key)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[13px]">
                      {it.title}
                      {it.source === "manual" && <Badge variant="outline" className="ml-2 text-[9px]">Manual</Badge>}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{it.subtitle}</div>
                  </div>
                  <div className="font-medium text-warning">{money(it.amount)}</div>
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
