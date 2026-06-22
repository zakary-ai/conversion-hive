import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import {
  listClosedDealsForCommission,
  updateBookingCommission,
  listCloserPayouts,
  recordCloserPayout,
  deleteCloserPayout,
  clearBookingOutcome,
} from "@/lib/api/b2c.functions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DollarSign, Percent, Trash2 } from "lucide-react";

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
  closers: { id: string; full_name: string; email: string } | null;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dealVolume = (r: Row) =>
  Number(r.deal_amount ?? 0) + Number(r.deposit_amount ?? 0) + Number(r.follow_up_amount ?? 0);

type RangeKey = "1d" | "30d" | "60d" | "90d" | "all";
const RANGE_DAYS: Record<RangeKey, number | null> = { "1d": 1, "30d": 30, "60d": 60, "90d": 90, all: null };

function isUnassigned(r: Row) {
  return !r.closers || r.commission_amount == null || Number(r.commission_amount) <= 0;
}

type Payout = { id: string; closer_id: string; amount: number; method: string; note: string | null; paid_at: string };

const METHODS = ["Cash", "ACH", "Wire", "PayPal", "Venmo", "Zelle", "Check", "Crypto", "Other"] as const;

function B2cCommissionsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["closed-deals-commission"],
    queryFn: () => listClosedDealsForCommission(),
  });
  const rows = data as Row[];

  const { data: payoutsData = [] } = useQuery({
    queryKey: ["closer-payouts"],
    queryFn: () => listCloserPayouts(),
  });
  const payoutsList = payoutsData as Payout[];

  const [range, setRange] = useState<RangeKey>("30d");

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
  const assigned = rows.filter((r) => !isUnassigned(r));

  // Group assigned commissions by closer; subtract recorded payouts
  const grouped = useMemo(() => {
    const m = new Map<string, { closer: { id: string; full_name: string; email: string }; earned: number; rows: Row[] }>();
    for (const r of assigned) {
      if (!r.closers) continue;
      const key = r.closers.id;
      const g = m.get(key) ?? { closer: r.closers, earned: 0, rows: [] };
      g.earned += Number(r.commission_amount ?? 0);
      g.rows.push(r);
      m.set(key, g);
    }
    const paidByCloser = new Map<string, { paid: number; payouts: Payout[] }>();
    for (const p of payoutsList) {
      const cur = paidByCloser.get(p.closer_id) ?? { paid: 0, payouts: [] };
      cur.paid += Number(p.amount);
      cur.payouts.push(p);
      paidByCloser.set(p.closer_id, cur);
    }
    return Array.from(m.values())
      .map((g) => {
        const pb = paidByCloser.get(g.closer.id) ?? { paid: 0, payouts: [] };
        return { ...g, paid: pb.paid, payouts: pb.payouts, owed: g.earned - pb.paid };
      })
      .sort((a, b) => b.owed - a.owed);
  }, [assigned, payoutsList]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-display font-semibold">Assign Commissions</h1>
          <p className="text-sm text-muted-foreground">Edit deal amount or percentage to recalculate the closer's commission.</p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-[130px] sm:w-[160px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Today</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="60d">Last 60 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
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
            <TabsTrigger value="payouts" className="flex-1 sm:flex-none text-xs sm:text-sm">Payouts <Badge variant="secondary" className="ml-1.5">{grouped.length}</Badge></TabsTrigger>
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

        <TabsContent value="payouts" className="grid gap-3">
          {grouped.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No payouts yet.</Card>
          ) : (
            grouped.map((g) => (
              <PayoutGroup
                key={g.closer.id}
                closer={g.closer}
                earned={g.earned}
                paid={g.paid}
                owed={g.owed}
                rows={g.rows}
                payouts={g.payouts}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PayoutGroup({
  closer, earned, paid, owed, rows, payouts,
}: {
  closer: { id: string; full_name: string; email: string };
  earned: number; paid: number; owed: number;
  rows: Row[]; payouts: Payout[];
}) {
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  return (
    <Card className="p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-left">
        <div className="min-w-0">
          <div className="font-medium truncate">{closer.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">{closer.email} · {rows.length} deal{rows.length === 1 ? "" : "s"}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Owed</div>
          <div className="text-lg sm:text-xl font-semibold text-success">{money(owed)}</div>
          <div className="text-[10px] text-muted-foreground">Earned {money(earned)} · Paid {money(paid)}</div>
        </div>
      </button>

      {open && (
        <div className="mt-3 border-t border-border pt-3 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Deals</div>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.applicant_name}</div>
                    <div className="text-xs text-muted-foreground capitalize truncate">
                      {r.outcome} · {r.outcome_at ? new Date(r.outcome_at).toLocaleDateString() : "—"} · {money(dealVolume(r))}
                      {r.commission_percent != null && <> · {r.commission_percent}%</>}
                    </div>
                  </div>
                  <div className="text-success font-medium shrink-0">{money(r.commission_amount)}</div>
                </div>
              ))}
            </div>
          </div>

          {payouts.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Payouts</div>
              <div className="space-y-1">
                {payouts.map((p) => <PayoutLine key={p.id} payout={p} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => setPayOpen(true)}>Record payout</Button>
      </div>

      <PayoutDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        closer={closer}
        suggested={owed > 0 ? owed : 0}
      />
    </Card>
  );
}

function PayoutLine({ payout }: { payout: Payout }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteCloserPayout({ data: { id: payout.id } }),
    onSuccess: () => { toast.success("Payout removed"); qc.invalidateQueries({ queryKey: ["closer-payouts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-sm">
      <div className="min-w-0">
        <div className="truncate">{payout.method}{payout.note ? ` · ${payout.note}` : ""}</div>
        <div className="text-xs text-muted-foreground">{new Date(payout.paid_at).toLocaleDateString()}</div>
      </div>
      <div className="font-medium shrink-0">{money(payout.amount)}</div>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => del.mutate()} disabled={del.isPending}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function PayoutDialog({
  open, onOpenChange, closer, suggested,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  closer: { id: string; full_name: string };
  suggested: number;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("ACH");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(suggested > 0 ? String(suggested.toFixed(2)) : "");
      setMethod("ACH");
      setNote("");
    }
  }, [open, suggested]);

  const save = useMutation({
    mutationFn: () => recordCloserPayout({
      data: {
        closer_id: closer.id,
        amount: parseFloat(amount),
        method,
        note: note.trim() || null,
      },
    }),
    onSuccess: () => {
      toast.success("Payout recorded");
      qc.invalidateQueries({ queryKey: ["closer-payouts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amt = parseFloat(amount);
  const valid = !isNaN(amt) && amt > 0 && method;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pay {closer.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Amount ($)</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {suggested > 0 && (
              <button type="button" onClick={() => setAmount(suggested.toFixed(2))} className="text-xs text-primary mt-1">
                Use full owed amount ({money(suggested)})
              </button>
            )}
          </div>
          <div>
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reference, period, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending ? "Saving…" : "Record payout"}
          </Button>
        </DialogFooter>
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

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2 flex-wrap">
            <span>{row.applicant_name}</span>
            <Badge variant={row.outcome === "closed" ? "default" : "secondary"} className="capitalize">{row.outcome}</Badge>
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
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
