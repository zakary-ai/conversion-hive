import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getAdminDashboard } from "@/lib/api/cl.functions";
import { PageHeader, StatCard } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck2, Video, PhoneCall, Clock, ExternalLink, Mail, Phone } from "lucide-react";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";

const opts = queryOptions({ queryKey: ["admin-dashboard"], queryFn: () => getAdminDashboard() });

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: AdminDashboard,
});

type Appt = Awaited<ReturnType<typeof getAdminDashboard>>["upcomingCalls"][number];

function AdminDashboard() {
  const { data } = useSuspenseQuery(opts);

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader title="Admin overview" description="Live metrics across all setters." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Calls booked today" value={data.callsBookedToday} icon={CalendarCheck2} hint="New bookings created today" />
        <StatCard label="Calls going live today" value={data.callsGoingLiveToday.length} icon={Video} hint="Scheduled to start today" />
        <StatCard label="Leads contacted today" value={data.contactedToday} icon={PhoneCall} />
      </div>

      <Section title="Upcoming calls" icon={Clock} empty="No upcoming calls scheduled.">
        {data.upcomingCalls.map((a) => <CallRow key={a.id} appt={a} showTimeOnly={false} />)}
      </Section>

      <Section title="Calls going live today" icon={Video} empty="Nothing on the schedule for today.">
        {data.callsGoingLiveToday.map((a) => <CallRow key={a.id} appt={a} showTimeOnly />)}
      </Section>
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

function CallRow({ appt, showTimeOnly }: { appt: Appt; showTimeOnly: boolean }) {
  const dt = new Date(appt.scheduled_at);
  const when = showTimeOnly
    ? dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Card className="p-3 flex items-start gap-3 flex-wrap">
      <div className="h-10 w-10 rounded-lg bg-success/15 text-success flex items-center justify-center shrink-0">
        <Video className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="font-medium truncate">{appt.name}</div>
          <div className="text-xs text-muted-foreground">{when}</div>
        </div>
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          {appt.phone && <a href={`tel:${appt.phone}`} className="flex items-center gap-1 text-primary"><Phone className="h-3 w-3" />{appt.phone}</a>}
          {appt.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{appt.email}</span>}
        </div>
        {appt.context && <div className="text-xs mt-1 text-muted-foreground">{appt.context}</div>}
      </div>
      {appt.meeting_url && (
        <Button asChild size="sm" variant="outline">
          <a href={appt.meeting_url} target="_blank" rel="noreferrer" className="flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Join
          </a>
        </Button>
      )}
    </Card>
  );
}
