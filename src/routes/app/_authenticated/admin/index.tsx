import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getAdminOverview } from "@/lib/api/cl.functions";
import { PageHeader, StatCard } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarCheck2, Video, Clock, ExternalLink, Mail, Phone, Users, CheckCircle2 } from "lucide-react";
import { useAdminChannel, type AdminChannel } from "@/components/app-sidebar";
import { ScheduledLeadDialog, type ScheduledLeadRow } from "@/components/admin/scheduled-lead-dialog";
import { OutcomeDialog } from "@/components/closer-outcome-dialog";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";


type Overview = Awaited<ReturnType<typeof getAdminOverview>>;
type Row = Overview["upcomingCalls"][number];

const overviewOpts = (channel: AdminChannel) =>
  queryOptions({
    queryKey: ["admin-overview", channel],
    queryFn: () => getAdminOverview({ data: { channel } }),
  });

export const Route = createFileRoute("/app/_authenticated/admin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewOpts("b2b")),
  component: AdminDashboard,
});

type MetricKey = "scheduledLeads" | "callsGoingLiveToday" | "callsBookedToday" | "callsClosedToday";

const METRIC_LABELS: Record<MetricKey, string> = {
  scheduledLeads: "Scheduled leads",
  callsGoingLiveToday: "Calls going live today",
  callsBookedToday: "Calls booked today",
  callsClosedToday: "Calls closed today",
};

function AdminDashboard() {
  const [channel] = useAdminChannel();
  const { data } = useSuspenseQuery(overviewOpts(channel));
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const [scheduledLead, setScheduledLead] = useState<ScheduledLeadRow | null>(null);


  const cards: { key: MetricKey; icon: typeof Users; hint?: string }[] = [
    { key: "scheduledLeads", icon: Users, hint: "Waiting to be assigned" },
    { key: "callsGoingLiveToday", icon: Video },
    { key: "callsBookedToday", icon: CalendarCheck2 },
    { key: "callsClosedToday", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <PageHeader title="Admin overview" description={`Live ${channel.toUpperCase()} metrics across all setters.`} />
        <ChannelToggle />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ key, icon, hint }) => (
          <button
            key={key}
            type="button"
            onClick={() => setOpenMetric(key)}
            className="text-left rounded-xl transition hover:ring-2 hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <StatCard label={METRIC_LABELS[key]} value={data[key].length} icon={icon} hint={hint} />
          </button>
        ))}
      </div>

      <Section title="Upcoming calls" icon={Clock} empty="No upcoming calls scheduled.">
        {data.upcomingCalls.map((a) => <CallRow key={a.id} row={a} showTimeOnly={false} />)}
      </Section>

      <Dialog open={openMetric !== null} onOpenChange={(o) => !o && setOpenMetric(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openMetric ? `${METRIC_LABELS[openMetric]} (${data[openMetric].length})` : ""}</DialogTitle>
          </DialogHeader>
          {openMetric && (
            <div className="space-y-2 pt-2">
              {data[openMetric].length === 0 ? (
                <Card className="p-6 text-sm text-muted-foreground text-center">Nothing here.</Card>
              ) : (
                data[openMetric].map((r) => (
                  <CallRow
                    key={r.id}
                    row={r}
                    showTimeOnly={false}
                    onClick={openMetric === "scheduledLeads" ? () => setScheduledLead(r) : undefined}
                  />
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ScheduledLeadDialog row={scheduledLead} channel={channel} onClose={() => setScheduledLead(null)} />
    </div>
  );
}


function ChannelToggle() {
  const [channel, setChannel] = useAdminChannel();
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs shrink-0">
      <button
        type="button"
        onClick={() => setChannel("b2b")}
        className={`rounded-md px-3 py-1.5 font-medium transition ${channel === "b2b" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
      >B2B</button>
      <button
        type="button"
        onClick={() => setChannel("b2c")}
        className={`rounded-md px-3 py-1.5 font-medium transition ${channel === "b2c" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
      >B2C</button>
    </div>
  );
}

function Section({ title, icon: Icon, children, empty }: { title: string; icon: typeof Clock; children: React.ReactNode; empty: string }) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.filter(Boolean).length > 0;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold">{title}</h3>
      </div>
      {hasItems ? <div className="space-y-2">{children}</div> : <Card className="p-6 text-sm text-muted-foreground text-center">{empty}</Card>}
    </div>
  );
}

function CallRow({ row, showTimeOnly, onClick }: { row: Row; showTimeOnly: boolean; onClick?: () => void }) {
  const dt = new Date(row.scheduled_at);
  const when = showTimeOnly
    ? dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Card
      className={`p-3 flex items-start gap-3 flex-wrap ${onClick ? "cursor-pointer hover:bg-muted/40 transition-colors" : ""}`}
      onClick={onClick}
    >

      <div className="h-10 w-10 rounded-lg bg-success/15 text-success flex items-center justify-center shrink-0">
        <Video className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="font-medium truncate">{row.name ?? "Unnamed"}</div>
          <div className="text-xs text-muted-foreground">{when}</div>
        </div>
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          {row.phone && <a href={`tel:${row.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-primary"><Phone className="h-3 w-3" />{row.phone}</a>}
          {row.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{row.email}</span>}
        </div>
        {row.context && <div className="text-xs mt-1 text-muted-foreground">{row.context}</div>}
      </div>
      {row.meeting_url && (
        <Button asChild size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
          <a href={row.meeting_url} target="_blank" rel="noreferrer" className="flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Join
          </a>
        </Button>
      )}
    </Card>
  );
}
