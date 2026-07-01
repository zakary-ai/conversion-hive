import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getB2bCloserDetail } from "@/lib/api/b2b-closers.functions";
import { setAppointmentOutcome } from "@/lib/api/cl.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, CheckCircle2, X, Clock, Pencil, ClipboardCheck, Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";
import { toast } from "sonner";

const money = (n: number | string | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type DetailAppt = {
  id: string;
  name: string;
  email: string | null;
  scheduled_at: string;
  status: string;
  outcome: string | null;
  outcome_set_at: string | null;
  deal_amount: number | string | null;
  commission_amount: number | string | null;
  lost_reason: string | null;
  meeting_url: string | null;
};

export function B2bCloserDetailDialog({
  closerId,
  open,
  onOpenChange,
}: {
  closerId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [outcomeTarget, setOutcomeTarget] = useState<DetailAppt | null>(null);
  const { data: detail, isLoading } = useQuery({
    queryKey: ["b2b-closer-detail", closerId],
    queryFn: () => getB2bCloserDetail({ data: { closer_id: closerId! } }),
    enabled: !!closerId && open,
  });

  const allAppointments: DetailAppt[] = detail?.appointments ?? [];

  type TimeKey = "1d" | "7d" | "30d" | "60d" | "all";
  const [timeFilter, setTimeFilter] = useState<TimeKey>("all");
  const timeOptions: { key: TimeKey; label: string; days: number | null }[] = [
    { key: "1d", label: "1 day", days: 1 },
    { key: "7d", label: "7 days", days: 7 },
    { key: "30d", label: "30 days", days: 30 },
    { key: "60d", label: "60 days", days: 60 },
    { key: "all", label: "All time", days: null },
  ];
  const cutoffMs = (() => {
    const opt = timeOptions.find((o) => o.key === timeFilter);
    if (!opt || opt.days == null) return null;
    return Date.now() - opt.days * 24 * 60 * 60 * 1000;
  })();
  const inWindow = (a: DetailAppt) => {
    if (cutoffMs == null) return true;
    const ref = a.outcome_set_at ?? a.scheduled_at;
    return new Date(ref).getTime() >= cutoffMs;
  };

  const appointments = allAppointments.filter(inWindow);
  const upcoming = appointments.filter((a) => !a.outcome && a.status !== "cancelled");
  const withOutcome = appointments.filter((a) => !!a.outcome);

  const stats = {
    closed: withOutcome.filter((a) => a.outcome === "closed").length,
    lost: withOutcome.filter((a) => a.outcome === "lost").length,
    noShow: withOutcome.filter((a) => a.outcome === "no_show").length,
    dq: withOutcome.filter((a) => a.outcome === "disqualified").length,
    totalDeals: withOutcome.reduce((s, a) => s + (a.outcome === "closed" ? Number(a.deal_amount ?? 0) : 0), 0),
  };
  const totalLogged = stats.closed + stats.lost;
  const closeRate = totalLogged === 0 ? 0 : Math.round((stats.closed / totalLogged) * 100);

  const [activeFilter, setActiveFilter] = useState<"all" | "not-logged" | "lost" | "no-show" | "closed" | "dq">("all");
  const filteredUpcoming = activeFilter === "all" || activeFilter === "not-logged" ? upcoming : [];
  const filteredOutcomes = withOutcome.filter((b) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "lost") return b.outcome === "lost";
    if (activeFilter === "no-show") return b.outcome === "no_show";
    if (activeFilter === "closed") return b.outcome === "closed";
    if (activeFilter === "dq") return b.outcome === "disqualified";
    return false;
  });

  const clearMutation = useMutation({
    mutationFn: (id: string) => setAppointmentOutcome({ data: { id, outcome: "clear" } }),
    onSuccess: () => {
      toast.success("Outcome cleared");
      qc.invalidateQueries({ queryKey: ["b2b-closer-detail", closerId] });
      qc.invalidateQueries({ queryKey: ["my-appointments"] });
      qc.invalidateQueries({ queryKey: ["all-appointments"] });
      qc.invalidateQueries({ queryKey: ["b2b-bookings-for-date"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filters = [
    { key: "all" as const, label: "All", count: appointments.length },
    { key: "not-logged" as const, label: "Not logged", count: upcoming.length },
    { key: "lost" as const, label: "Lost", count: stats.lost },
    { key: "no-show" as const, label: "No show", count: stats.noShow },
    { key: "closed" as const, label: "Closed", count: stats.closed },
    { key: "dq" as const, label: "DQ", count: stats.dq },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {detail?.closer?.full_name ?? "B2B Closer"}
            {detail?.closer?.email && <span className="ml-2 text-xs text-muted-foreground">· {detail.closer.email}</span>}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>}

        {detail && (
          <>
            <div className="flex flex-wrap gap-2">
              {timeOptions.map((t) => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={timeFilter === t.key ? "default" : "outline"}
                  className={cn("h-7 text-xs", timeFilter === t.key && "bg-primary text-primary-foreground")}
                  onClick={() => setTimeFilter(t.key)}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Stat icon={<Target className="h-3 w-3" />} label="Close rate" value={`${closeRate}%`} tone="text-success" onClick={() => setActiveFilter("all")} active={activeFilter === "all"} />
              <Stat icon={<CheckCircle2 className="h-3 w-3" />} label="Wins" value={stats.closed} tone="text-success" onClick={() => setActiveFilter("closed")} active={activeFilter === "closed"} />
              <Stat icon={<X className="h-3 w-3" />} label="Lost" value={stats.lost} onClick={() => setActiveFilter("lost")} active={activeFilter === "lost"} />
              <Stat icon={<Clock className="h-3 w-3" />} label="No show" value={stats.noShow} onClick={() => setActiveFilter("no-show")} active={activeFilter === "no-show"} />
              <Stat icon={<Ban className="h-3 w-3" />} label="DQ" value={stats.dq} onClick={() => setActiveFilter("dq")} active={activeFilter === "dq"} />
            </div>

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


            {(activeFilter === "all" || activeFilter === "not-logged") && (
              <Section title={`Upcoming / not yet logged (${filteredUpcoming.length})`}>
                {filteredUpcoming.length === 0
                  ? <Empty>Nothing upcoming.</Empty>
                  : filteredUpcoming.map((a) => (
                      <UpcomingRow key={a.id} a={a} onLog={() => setOutcomeTarget(a)} />
                    ))}
              </Section>
            )}

            {activeFilter !== "not-logged" && (
              <Section title={`Outcomes (${filteredOutcomes.length})`}>
                {filteredOutcomes.length === 0
                  ? <Empty>No outcomes logged yet.</Empty>
                  : filteredOutcomes.map((a) => (
                      <OutcomeRow key={a.id} a={a} onEdit={() => setOutcomeTarget(a)} onClear={() => clearMutation.mutate(a.id)} clearing={clearMutation.isPending} />
                    ))}
              </Section>
            )}
          </>
        )}
      </DialogContent>

      <AppointmentDetailDialog
        appt={outcomeTarget ? {
          id: outcomeTarget.id,
          lead_id: null,
          type: "booking",
          scheduled_at: outcomeTarget.scheduled_at,
          name: outcomeTarget.name,
          phone: null,
          email: outcomeTarget.email,
          context: null,
          meeting_url: outcomeTarget.meeting_url,
          outcome: outcomeTarget.outcome,
          deal_amount: outcomeTarget.deal_amount,
          commission_amount: outcomeTarget.commission_amount,
          lost_reason: outcomeTarget.lost_reason,
        } : null}
        onClose={() => setOutcomeTarget(null)}
      />
    </Dialog>
  );
}

function UpcomingRow({ a, onLog }: { a: DetailAppt; onLog: () => void }) {
  return (
    <Card className="p-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="font-medium truncate">{a.name}</div>
        <div className="text-xs text-muted-foreground truncate">{new Date(a.scheduled_at).toLocaleString()} {a.email ? `· ${a.email}` : ""}</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px] capitalize">{a.status}</Badge>
        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={onLog}>
          <ClipboardCheck className="h-3 w-3" /> Log outcome
        </Button>
      </div>
    </Card>
  );
}

function OutcomeRow({ a, onEdit, onClear, clearing }: { a: DetailAppt; onEdit: () => void; onClear?: () => void; clearing?: boolean }) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2 flex-wrap text-sm">
            <span>{a.name}</span>
            <Badge variant="secondary" className="text-[10px] capitalize">{a.outcome?.replace("_", " ")}</Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {a.outcome_set_at ? new Date(a.outcome_set_at).toLocaleString() : new Date(a.scheduled_at).toLocaleString()}
            {a.outcome === "closed" && a.deal_amount != null ? ` · Deal ${money(a.deal_amount)}` : ""}
          </div>
          {a.lost_reason && <div className="text-xs mt-1 italic text-muted-foreground">{a.lost_reason}</div>}
        </div>
        <div className="flex items-start gap-2">
          {a.outcome === "closed" && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Commission</div>
              <div className="text-sm font-semibold text-success">{money(a.commission_amount)}</div>
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={onEdit}>
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          {onClear && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={onClear} disabled={clearing}>
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({ icon, label, value, tone, hint, onClick, active }: { icon: React.ReactNode; label: string; value: string | number; tone?: string; hint?: string; onClick?: () => void; active?: boolean }) {
  return (
    <Card
      className={cn("p-3", onClick && "cursor-pointer transition-colors hover:bg-accent/50", active && "ring-1 ring-primary")}
      onClick={onClick}
    >
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
