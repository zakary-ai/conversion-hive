import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getCloserDetail, getCloserStats } from "@/lib/api/b2c.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, CheckCircle2, X, Clock, Pencil, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { RangePicker } from "@/routes/app/_authenticated/closer/index";
import { OutcomeDialog } from "@/components/closer-outcome-dialog";

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CloserDetailDialog({
  closerId,
  open,
  onOpenChange,
}: {
  closerId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rangeDays, setRangeDays] = useState<number | null>(null);
  const [outcomeTarget, setOutcomeTarget] = useState<{ id: string; name: string } | null>(null);
  const { data: detail, isLoading } = useQuery({
    queryKey: ["closer-detail", closerId],
    queryFn: () => getCloserDetail({ data: { closer_id: closerId! } }),
    enabled: !!closerId && open,
  });
  const { data: stats } = useQuery({
    queryKey: ["closer-stats", closerId, rangeDays],
    queryFn: () => getCloserStats({ data: { closer_id: closerId!, days: rangeDays ?? undefined } }),
    enabled: !!closerId && open,
  });

  const [activeFilter, setActiveFilter] = useState<"all" | "not-logged" | "not-interested" | "no-show" | "closed">("all");

  const bookings = detail?.bookings ?? [];
  const withOutcome = bookings.filter((b) => b.outcome);
  const upcoming = bookings.filter((b) => !b.outcome);

  const filteredUpcoming = activeFilter === "all" || activeFilter === "not-logged" ? upcoming : [];
  const filteredOutcomes = withOutcome.filter((b) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "not-interested") return b.outcome === "not_interested";
    if (activeFilter === "no-show") return b.outcome === "no_show";
    if (activeFilter === "closed") return b.outcome === "closed" || b.outcome === "deposit";
    return false;
  });

  const filters = [
    { key: "all" as const, label: "All", count: bookings.length },
    { key: "not-logged" as const, label: "Not logged", count: upcoming.length },
    { key: "not-interested" as const, label: "Not interested", count: withOutcome.filter((b) => b.outcome === "not_interested").length },
    { key: "no-show" as const, label: "No show", count: withOutcome.filter((b) => b.outcome === "no_show").length },
    { key: "closed" as const, label: "Closed", count: withOutcome.filter((b) => b.outcome === "closed" || b.outcome === "deposit").length },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {detail?.closer?.full_name ?? "Closer"}
            {detail?.closer?.email && <span className="ml-2 text-xs text-muted-foreground">· {detail.closer.email}</span>}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>}

        {stats && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Performance</div>
              <RangePicker value={rangeDays} onChange={setRangeDays} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat icon={<Target className="h-3 w-3" />} label="Close rate" value={`${stats.closeRate}%`} tone="text-success" />
              <Stat icon={<CheckCircle2 className="h-3 w-3" />} label="Wins" value={stats.closed + stats.deposit} tone="text-success" hint={`${stats.closed} closed · ${stats.deposit} deposits`} />
              <Stat icon={<X className="h-3 w-3" />} label="Not interested" value={stats.notInterested} />
              <Stat icon={<Clock className="h-3 w-3" />} label="Excluded" value={stats.noShow + stats.disqualified} hint={`${stats.noShow} no-show · ${stats.disqualified} DQ`} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={activeFilter === f.key ? "default" : "outline"}
              className={cn("h-7 text-xs", activeFilter === f.key && "bg-primary text-primary-foreground")}
              onClick={() => setActiveFilter(f.key)}
            >
              {f.label} <span className="ml-1 opacity-70">({f.count})</span>
            </Button>
          ))}
        </div>

        {activeFilter === "all" || activeFilter === "not-logged" ? (
          <Section title={`Upcoming / not yet logged (${filteredUpcoming.length})`}>
            {filteredUpcoming.length === 0
              ? <Empty>Nothing upcoming.</Empty>
              : filteredUpcoming.map((b) => (
                  <UpcomingRow key={b.id} b={b} onLog={() => setOutcomeTarget({ id: b.id, name: b.applicant_name })} />
                ))}
          </Section>
        ) : null}

        {activeFilter === "all" || activeFilter !== "not-logged" ? (
          <Section title={`Outcomes (${filteredOutcomes.length})`}>
            {filteredOutcomes.length === 0
              ? <Empty>No outcomes logged yet.</Empty>
              : filteredOutcomes.map((b) => (
                  <OutcomeRow key={b.id} b={b} onEdit={() => setOutcomeTarget({ id: b.id, name: b.applicant_name })} />
                ))}
          </Section>
        ) : null}
      </DialogContent>
      <OutcomeDialog
        bookingId={outcomeTarget?.id ?? ""}
        applicationId={null}
        applicantName={outcomeTarget?.name ?? ""}
        open={!!outcomeTarget}
        onOpenChange={(v) => { if (!v) setOutcomeTarget(null); }}
      />
    </Dialog>
  );
}

function UpcomingRow({ b, onLog }: { b: { id: string; applicant_name: string; applicant_email: string; slot_start: string; status: string }; onLog: () => void }) {
  return (
    <Card className="p-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="font-medium truncate">{b.applicant_name}</div>
        <div className="text-xs text-muted-foreground truncate">{new Date(b.slot_start).toLocaleString()} · {b.applicant_email}</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px] capitalize">{b.status}</Badge>
        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={onLog}>
          <ClipboardCheck className="h-3 w-3" /> Log outcome
        </Button>
      </div>
    </Card>
  );
}

function Stat({ icon, label, value, tone, hint }: { icon: React.ReactNode; label: string; value: string | number; tone?: string; hint?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className={`text-2xl font-display font-semibold mt-1 ${tone ?? ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 mt-2">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Card className="p-4 text-center text-xs text-muted-foreground">{children}</Card>;
}

type B = {
  id: string;
  applicant_name: string;
  applicant_email: string;
  slot_start: string;
  outcome: string | null;
  outcome_at: string | null;
  outcome_notes: string | null;
  deal_amount: number | null;
  deposit_amount: number | null;
  follow_up_amount: number | null;
  commission_amount: number | null;
  commission_status: string | null;
};

function OutcomeRow({ b, onEdit }: { b: B; onEdit: () => void }) {
  const base = b.outcome === "closed"
    ? Number(b.deal_amount ?? 0)
    : b.outcome === "deposit"
      ? Number(b.deposit_amount ?? 0) + Number(b.follow_up_amount ?? 0)
      : 0;
  const isApproved = (b.commission_status ?? "pending") === "approved";
  const showCommission = b.outcome === "closed" || b.outcome === "deposit";
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2 flex-wrap text-sm">
            <span>{b.applicant_name}</span>
            <Badge variant="secondary" className="text-[10px] capitalize">{b.outcome?.replace("_", " ")}</Badge>
            {showCommission && (isApproved
              ? <Badge className="text-[10px] bg-success/15 text-success border-success/30">Approved</Badge>
              : <Badge className="text-[10px] bg-warning/15 text-warning border-warning/30">Pending</Badge>)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {b.outcome_at ? new Date(b.outcome_at).toLocaleString() : new Date(b.slot_start).toLocaleString()}
            {base > 0 ? ` · Deal ${money(base)}` : ""}
          </div>
          {b.outcome_notes && <div className="text-xs mt-1 italic text-muted-foreground">{b.outcome_notes}</div>}
        </div>
        <div className="flex items-start gap-3">
          {showCommission && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Commission</div>
              <div className={`text-sm font-semibold ${isApproved ? "text-success" : "text-warning"}`}>{money(b.commission_amount)}</div>
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={onEdit}>
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        </div>
      </div>
    </Card>
  );
}
