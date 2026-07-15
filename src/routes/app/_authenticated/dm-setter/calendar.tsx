import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyDmBookings } from "@/lib/api/dm-setters.functions";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, CalendarClock, User } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/dm-setter/calendar")({
  component: DmSetterCalendar,
});

type Row = {
  id: string;
  application_id: string | null;
  slot_start: string;
  status: string;
  outcome: string | null;
  zoom_join_url: string | null;
  applicant_name: string;
  applicant_email: string | null;
  applicant_phone: string | null;
  closers: { full_name: string | null; email: string | null } | null;
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const OUTCOME_LABEL: Record<string, string> = {
  closed: "Closed",
  no_show: "No Show",
  disqualified: "Disqualified",
  not_interested: "Not Interested",
  rescheduled: "Rescheduled",
  pending: "Pending",
};

function outcomeBadge(b: Row) {
  const isPast = new Date(b.slot_start).getTime() < Date.now();
  if (b.outcome) {
    const label = OUTCOME_LABEL[b.outcome] ?? b.outcome;
    const cls =
      b.outcome === "closed"
        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
        : b.outcome === "no_show"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : b.outcome === "disqualified" || b.outcome === "not_interested"
        ? "bg-red-500/15 text-red-400 border-red-500/30"
        : "bg-muted text-foreground/70";
    return <Badge variant="outline" className={`text-[10px] ${cls}`}>{label}</Badge>;
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      {isPast ? "Awaiting outcome" : "Scheduled"}
    </Badge>
  );
}


function DmSetterCalendar() {
  const { data, isLoading } = useQuery({ queryKey: ["my-dm-bookings"], queryFn: () => listMyDmBookings() });
  const rows = (data?.rows ?? []) as Row[];
  const [date, setDate] = useState<Date | undefined>(new Date());

  const bookedDays = useMemo(() => rows.map((r) => new Date(r.slot_start)), [rows]);
  const dayRows = useMemo(() => date ? rows.filter((r) => sameDay(new Date(r.slot_start), date)) : [], [rows, date]);
  const upcoming = useMemo(() => rows.filter((r) => new Date(r.slot_start).getTime() > Date.now()).slice(0, 5), [rows]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4">
      <div className="text-center">
        <h1 className="text-2xl font-display font-semibold">Calendar</h1>
        <p className="text-sm text-muted-foreground">Calls booked by leads you referred.</p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground text-center">Loading…</div>}

      <div className="grid md:grid-cols-[auto_1fr] gap-4 justify-items-center md:justify-items-start">
        <Card className="p-2 w-fit">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            modifiers={{ booked: bookedDays }}
            modifiersClassNames={{ booked: "bg-primary/20 text-primary font-semibold" }}
          />
        </Card>
        <div className="space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">
            {date ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Select a day"}
          </h2>
          {dayRows.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">No calls this day.</Card>
          )}
          {dayRows.map((b) => {
            const time = new Date(b.slot_start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            return (
              <Card key={b.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    <span>{b.applicant_name}</span>
                    <Badge variant="secondary" className="text-[10px]">{b.status}</Badge>
                    {b.outcome && <Badge variant="outline" className="text-[10px]">{b.outcome}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {time}</span>
                    {b.applicant_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.applicant_email}</span>}
                    {b.applicant_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.applicant_phone}</span>}
                    {b.closers?.full_name && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Closer: {b.closers.full_name}</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {upcoming.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Upcoming calls</div>
          <div className="space-y-1 text-xs">
            {upcoming.map((b) => (
              <div key={b.id} className="flex justify-between border-b border-border/40 py-1">
                <span>{b.applicant_name}</span>
                <span className="text-muted-foreground">{new Date(b.slot_start).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
