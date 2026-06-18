import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listClosedDealsForCommission, updateBookingCommission } from "@/lib/api/b2c.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DollarSign, Percent } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/b2c-commissions")({
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

function B2cCommissionsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["closed-deals-commission"],
    queryFn: () => listClosedDealsForCommission(),
  });
  const rows = data as Row[];

  const totalCommission = rows.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);
  const totalDeals = rows.reduce((s, r) => s + Number(r.deal_amount ?? 0) + Number(r.deposit_amount ?? 0) + Number(r.follow_up_amount ?? 0), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display font-semibold">Assign Commissions</h1>
        <p className="text-sm text-muted-foreground">All closed and deposit deals. Edit the deal amount or percentage to recalculate the closer's commission.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total deal volume</div>
          <div className="text-2xl font-display font-semibold mt-1">{money(totalDeals)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total commissions</div>
          <div className="text-2xl font-display font-semibold mt-1 text-success">{money(totalCommission)}</div>
        </Card>
      </div>

      <div className="grid gap-3">
        {isLoading && <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>}
        {!isLoading && rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No closed deals yet.</Card>
        )}
        {rows.map((r) => <DealRow key={r.id} row={r} />)}
      </div>
    </div>
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
