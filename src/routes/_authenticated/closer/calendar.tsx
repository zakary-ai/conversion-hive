import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCloserBookings } from "@/lib/api/b2c.functions";
import { meQueryOptions } from "@/routes/_authenticated/route";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, Video, CalendarClock, ClipboardCheck } from "lucide-react";
import { LeadPreviewDialog } from "@/components/lead-preview-dialog";
import { OutcomeDialog } from "@/components/closer-outcome-dialog";

export const Route = createFileRoute("/_authenticated/closer/calendar")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.isCloser && !me.isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: CloserCalendar,
});

type B = {
  id: string;
  application_id: string | null;
  slot_start: string;
  status: string;
  zoom_join_url: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CloserCalendar() {
  const { data } = useQuery({ queryKey: ["closer-bookings"], queryFn: () => listCloserBookings() });
  const rows = (data?.rows ?? []) as B[];
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [previewFor, setPreviewFor] = useState<B | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<B | null>(null);

  const bookedDays = useMemo(() => rows.map((r) => new Date(r.slot_start)), [rows]);
  const dayBookings = useMemo(() => date ? rows.filter((r) => sameDay(new Date(r.slot_start), date)) : [], [rows, date]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-semibold">My calendar</h1>
        <p className="text-sm text-muted-foreground">All calls assigned to you.</p>
      </div>

      <div className="grid md:grid-cols-[auto_1fr] gap-4">
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
          {dayBookings.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">No calls this day.</Card>
          )}
          {dayBookings.map((b) => {
            const time = new Date(b.slot_start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            return (
              <Card key={b.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 cursor-pointer" onClick={() => setPreviewFor(b)}>
                  <div className="font-medium flex items-center gap-2">
                    <span className="text-primary hover:underline">{b.applicant_name}</span>
                    <Badge variant="secondary" className="text-[10px]">{b.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {time}</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.applicant_email}</span>
                    {b.applicant_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.applicant_phone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {b.zoom_join_url && (
                    <a href={b.zoom_join_url} target="_blank" rel="noreferrer">
                      <Button size="sm" className="gap-1"><Video className="h-3 w-3" /> Join</Button>
                    </a>
                  )}
                  {b.status === "assigned" && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setOutcomeFor(b)}>
                      <ClipboardCheck className="h-3 w-3" /> Outcome
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <LeadPreviewDialog
        booking={previewFor}
        open={!!previewFor}
        onOpenChange={(v) => !v && setPreviewFor(null)}
      />
      {outcomeFor && (
        <OutcomeDialog
          bookingId={outcomeFor.id}
          applicationId={outcomeFor.application_id}
          applicantName={outcomeFor.applicant_name}
          open={!!outcomeFor}
          onOpenChange={(v) => !v && setOutcomeFor(null)}
        />
      )}
    </div>
  );
}
