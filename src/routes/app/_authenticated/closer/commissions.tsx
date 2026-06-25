import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listMyCloserCommissions, submitManualCommission } from "@/lib/api/b2c.functions";
import { meQueryOptions } from "@/routes/app/_authenticated/route";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, CheckCircle2, Clock, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/_authenticated/closer/commissions")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.isCloser && !me.isAdmin) throw redirect({ to: "/app/dashboard" });
  },
  component: CloserCommissions,
});

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CloserCommissions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["my-closer-commissions"],
    queryFn: () => listMyCloserCommissions(),
  });
  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { closed: 0, deposit: 0, commission: 0, approved: 0, pending: 0 };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold">My commissions</h1>
          <p className="text-sm text-muted-foreground">Pending commissions are awaiting admin approval before they're confirmed.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Submit commission</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="Approved" value={money(totals.approved)} accent="text-success" />
        <StatCard label="Pending approval" value={money(totals.pending)} accent="text-warning" />
        <StatCard label="Total" value={money(totals.commission)} />
      </div>

      <div className="grid gap-2">
        {isLoading && <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>}
        {!isLoading && rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No commissions yet — close a deal to start earning.</Card>
        )}
        {rows.map((r) => {
          const date = r.outcome_at ? new Date(r.outcome_at).toLocaleDateString() : "—";
          const base = r.outcome === "closed"
            ? Number(r.deal_amount ?? 0)
            : Number(r.deposit_amount ?? 0) + Number(r.follow_up_amount ?? 0);
          const isApproved = (r.commission_status ?? "pending") === "approved";
          return (
            <Card key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {isApproved
                    ? <CheckCircle2 className="h-4 w-4 text-success" />
                    : <Clock className="h-4 w-4 text-warning" />}
                  {r.applicant_name}
                  <Badge variant="secondary" className="capitalize text-[10px]">{r.outcome}</Badge>
                  {isApproved
                    ? <Badge className="text-[10px] bg-success/15 text-success border-success/30">Approved</Badge>
                    : <Badge className="text-[10px] bg-warning/15 text-warning border-warning/30">Pending approval</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {date} · Deal {money(base)} {r.commission_percent ? `· ${r.commission_percent}%` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Commission</div>
                <div className={`text-lg font-semibold ${isApproved ? "text-success" : "text-warning"}`}>
                  {money(r.commission_amount)}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <ManualCommissionDialog open={open} onOpenChange={setOpen} onSubmitted={() => qc.invalidateQueries({ queryKey: ["my-closer-commissions"] })} />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        <DollarSign className="h-3 w-3" /> {label}
      </div>
      <div className={`text-2xl font-display font-semibold mt-1 ${accent ?? ""}`}>{value}</div>
    </Card>
  );
}

function ManualCommissionDialog({ open, onOpenChange, onSubmitted }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmitted: () => void }) {
  const [leadName, setLeadName] = useState("");
  const [dealSize, setDealSize] = useState("");
  const [pct, setPct] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setLeadName(""); setDealSize(""); setPct(""); setAmount(""); setAmountTouched(false);
    }
  }, [open]);

  // auto-fill commission amount from deal × pct until user edits it
  useEffect(() => {
    if (amountTouched) return;
    const d = parseFloat(dealSize);
    const p = parseFloat(pct);
    if (!isNaN(d) && !isNaN(p)) {
      setAmount(((d * p) / 100).toFixed(2));
    }
  }, [dealSize, pct, amountTouched]);

  const submit = useMutation({
    mutationFn: () => submitManualCommission({
      data: {
        lead_name: leadName.trim(),
        deal_amount: parseFloat(dealSize) || 0,
        commission_percent: parseFloat(pct) || 0,
        commission_amount: parseFloat(amount) || 0,
      },
    }),
    onSuccess: () => {
      toast.success("Commission submitted for approval");
      onSubmitted();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit"),
  });

  const disabled = !leadName.trim() || !dealSize || !pct || !amount || submit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit a commission</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Lead name</Label>
            <Input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Deal size ($)</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={dealSize} onChange={(e) => setDealSize(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Commission rate (%)</Label>
              <Input type="number" inputMode="decimal" min="0" max="100" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="10" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Commission amount ($)</Label>
            <Input
              type="number" inputMode="decimal" min="0" step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }}
              placeholder="Auto-calculated from deal × rate"
            />
            <p className="text-[11px] text-muted-foreground">Auto-fills from deal size × rate — override if needed.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={disabled}>
            {submit.isPending ? "Submitting…" : "Submit for approval"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
