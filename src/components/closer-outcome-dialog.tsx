import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recordBookingOutcome, getApplicationById } from "@/lib/api/b2c.functions";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Outcome = "not_interested" | "disqualified" | "closed" | "deposit" | "no_show";
type Pct = 10 | 15 | 20;

export function OutcomeDialog({
  bookingId,
  applicationId,
  applicantName,
  open,
  onOpenChange,
}: {
  bookingId: string;
  applicationId: string | null;
  applicantName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [dealAmount, setDealAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [followUpAmount, setFollowUpAmount] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [commissionPct, setCommissionPct] = useState<Pct | null>(null);
  const [notes, setNotes] = useState("");

  const { data: app } = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => getApplicationById({ data: { id: applicationId! } }),
    enabled: !!applicationId && open,
  });

  const submit = useMutation({
    mutationFn: () => recordBookingOutcome({
      data: {
        booking_id: bookingId,
        outcome: outcome!,
        deal_amount: outcome === "closed" ? Number(dealAmount) || 0 : null,
        deposit_amount: outcome === "deposit" ? Number(depositAmount) || 0 : null,
        follow_up_amount: outcome === "deposit" ? Number(followUpAmount) || 0 : null,
        follow_up_date: outcome === "deposit" ? followUpDate : null,
        commission_percent: (outcome === "closed" || outcome === "deposit") ? commissionPct : null,
        notes: notes || null,
      },
    }),
    onSuccess: () => {
      toast.success("Outcome recorded");
      qc.invalidateQueries({ queryKey: ["closer-bookings"] });
      qc.invalidateQueries({ queryKey: ["b2c-admin-stats"] });
      qc.invalidateQueries({ queryKey: ["my-closer-commissions"] });
      qc.invalidateQueries({ queryKey: ["closed-deals-commission"] });
      qc.invalidateQueries({ queryKey: ["my-closer-stats"] });
      qc.invalidateQueries({ queryKey: ["closer-detail"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() {
    setOutcome(null); setDealAmount(""); setDepositAmount("");
    setFollowUpAmount(""); setFollowUpDate(""); setCommissionPct(null); setNotes("");
  }

  const needsPct = outcome === "closed" || outcome === "deposit";
  const canSubmit = outcome
    && (outcome !== "closed" || Number(dealAmount) > 0)
    && (outcome !== "deposit" || (Number(depositAmount) > 0 && Number(followUpAmount) > 0 && !!followUpDate))
    && (!needsPct || commissionPct !== null);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Call outcome — {applicantName}</DialogTitle>
        </DialogHeader>

        {app && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
            <div><span className="text-muted-foreground">Income now:</span> {app.current_monthly_income} → <span className="text-muted-foreground">goal</span> {app.desired_monthly_income}</div>
            <div><span className="text-muted-foreground">Invest:</span> {app.open_to_invest} · <span className="text-muted-foreground">Credit:</span> {app.credit_score_range}</div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Outcome</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["not_interested","disqualified","closed","deposit","no_show"] as Outcome[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(o)}
                className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition ${
                  outcome === o ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted/40"
                }`}
              >
                {o.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {outcome === "closed" && (
          <div className="space-y-1">
            <Label htmlFor="deal">Deal size ($)</Label>
            <Input id="deal" type="number" min="0" step="1" value={dealAmount} onChange={(e) => setDealAmount(e.target.value)} placeholder="5000" />
          </div>
        )}

        {outcome === "deposit" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="dep">Deposit amount ($)</Label>
              <Input id="dep" type="number" min="0" step="1" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="500" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fa">Follow-up close amount ($)</Label>
              <Input id="fa" type="number" min="0" step="1" value={followUpAmount} onChange={(e) => setFollowUpAmount(e.target.value)} placeholder="4500" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fd">Follow-up date</Label>
              <Input id="fd" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </div>
          </div>
        )}

        {needsPct && (
          <div className="space-y-2">
            <Label>Commission %</Label>
            <div className="grid grid-cols-3 gap-2">
              {([10, 15, 20] as Pct[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCommissionPct(p)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                    commissionPct === p ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted/40"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Saving…" : "Submit outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
