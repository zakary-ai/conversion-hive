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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DollarSign, Percent, Trash2, Wallet } from "lucide-react";

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
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString() : "—");

const dealVolume = (r: Row) =>
  Number(r.deal_amount ?? 0) + Number(r.deposit_amount ?? 0) + Number(r.follow_up_amount ?? 0);

type RangeKey = "1d" | "30d" | "60d" | "90d" | "all";
const RANGE_DAYS: Record<RangeKey, number | null> = { "1d": 1, "30d": 30, "60d": 60, "90d": 90, all: null };

function isUnassigned(r: Row) {
  return !r.closers || r.commission_amount == null || Number(r.commission_amount) <= 0;
}

function B2cCommissionsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["closed-deals-commission"],
    queryFn: () => listClosedDealsForCommission(),
  });
  const rows = data as Row[];

  const [range, setRange] = useState<RangeKey>("30d");
  const [payoutsOpen, setPayoutsOpen] = useState(false);

  const inRange = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days == null) return rows;
    const cutoff = Date.now() - days * 86400_000;
    return rows.filter((r) => {
      const t = r.outcome_at ? new Date(r.outcome_at).getTime() : 0;
      return t >= cutoff;
    });
  }, [rows, range]);

  const totalCommission = inRange.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);
  const totalDeals = inRange.reduce((s, r) => s + dealVolume(r), 0);

  const unassigned = rows.filter(isUnassigned);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-display font-semibold">Assign Commissions</h1>
          <p className="text-sm text-muted-foreground">Edit deal amount or percentage to recalculate the closer's commission.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => setPayoutsOpen(true)}>
            <Wallet className="h-4 w-4 mr-1" /> Payouts
          </Button>
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[130px] sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Today</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="60d">Last 60 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 min-w-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total deal volume</div>
          <div className="text-xl sm:text-2xl font-display font-semibold mt-1 truncate">{money(totalDeals)}</div>
        </Card>
        <Card className="p-4 min-w-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total commissions</div>
          <div className="text-xl sm:text-2xl font-display font-semibold mt-1 text-success truncate">{money(totalCommission)}</div>
        </Card>
      </div>

      <Tabs defaultValue="history" className="space-y-4">
        <div className="-mx-1 overflow-x-auto">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="history" className="flex-1 sm:flex-none text-xs sm:text-sm">History <Badge variant="secondary" className="ml-1.5">{rows.length}</Badge></TabsTrigger>
            <TabsTrigger value="unassigned" className="flex-1 sm:flex-none text-xs sm:text-sm">Unassigned <Badge variant="secondary" className="ml-1.5">{unassigned.length}</Badge></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="history" className="grid gap-3">
          {isLoading && <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>}
          {!isLoading && rows.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">No closed deals yet.</Card>
          )}
          {rows.map((r) => <DealRow key={r.id} row={r} />)}
        </TabsContent>

        <TabsContent value="unassigned" className="grid gap-3">
          {unassigned.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">All commissions are assigned.</Card>
          ) : (
            unassigned.map((r) => <DealRow key={r.id} row={r} />)
          )}
        </TabsContent>
      </Tabs>

      <PayoutsSheet open={payoutsOpen} onOpenChange={setPayoutsOpen} rows={rows} />
    </div>
  );
}

// ---------- Payouts Sheet (mirrors B2B) ----------
type PayoutBucket = "unpaid" | "paid";

function PayoutsSheet({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (v: boolean) => void; rows: Row[] }) {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<PayoutBucket | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  // Only approved+assigned commissions count as "owed" / "paid"
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

function DealRow({ row }: { row: Row }) {
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
  }, [row.id]);

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
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
      qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closerName = row.closers?.full_name ?? "Unassigned";
  const when = row.outcome_at ? new Date(row.outcome_at).toLocaleDateString() : "—";

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
  const isPaid = !!row.commission_paid_at;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2 flex-wrap">
            <span>{row.applicant_name}</span>
            <Badge variant={row.outcome === "closed" ? "default" : "secondary"} className="capitalize">{row.outcome}</Badge>
            {isApproved
              ? <Badge className="text-[10px] bg-success/15 text-success border-success/30">Approved</Badge>
              : <Badge className="text-[10px] bg-warning/15 text-warning border-warning/30">Pending approval</Badge>}
            {isPaid && <Badge className="text-[10px] bg-success/15 text-success border-success/30">Paid</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {closerName} · closed {when}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Commission</div>
          <div className="text-lg font-semibold text-success">{money(row.commission_amount)}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        {row.outcome === "closed" && (
          <div>
            <Label className="text-xs">Deal ($)</Label>
            <Input type="number" value={deal} onChange={(e) => setDeal(e.target.value)} />
          </div>
        )}
        {row.outcome === "deposit" && (
          <>
            <div>
              <Label className="text-xs">Deposit ($)</Label>
              <Input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Follow-up ($)</Label>
              <Input type="number" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <Label className="text-xs flex items-center gap-1"><Percent className="h-3 w-3" /> %</Label>
          <Select value={pct} onValueChange={(v) => setPct(v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10%</SelectItem>
              <SelectItem value="15">15%</SelectItem>
              <SelectItem value="20">20%</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs flex items-center gap-1"><DollarSign className="h-3 w-3" /> Override</Label>
          <Input
            type="number"
            value={override}
            placeholder={computed != null ? String(computed) : ""}
            onChange={(e) => { setOverride(e.target.value); setUseOverride(true); }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          {computed != null ? <>Computed: <span className="text-foreground">{money(computed)}</span></> : "Pick a percentage to compute"}
          {useOverride && override && <span className="ml-2">· Override active</span>}
        </div>
        <div className="flex items-center gap-2">
          <DeleteCommissionButton bookingId={row.id} name={row.applicant_name} />
          <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {!isApproved && (
            <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending ? "Approving…" : "Approve"}
            </Button>
          )}
        </div>
      </div>
    </Card>
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
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
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
