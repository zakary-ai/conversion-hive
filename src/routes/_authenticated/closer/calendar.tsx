import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCloserBookings } from "@/lib/api/b2c.functions";
import { meQueryOptions } from "@/routes/_authenticated/route";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Video, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/closer/calendar")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.isCloser && !me.isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: CloserCalendar,
});

type B = {
  id: string; slot_start: string; status: string; zoom_join_url: string | null;
  applicant_name: string; applicant_email: string; applicant_phone: string | null;
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CloserCalendar() {
  const { data } = useQuery({ queryKey: ["closer-bookings"], queryFn: () => listCloserBookings() });
  const rows = (data?.rows ?? []) as B[];
  const [date, setDate] = useState<Date | undefined>(new Date());

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
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">{b.applicant_name} <Badge variant="secondary" className="text-[10px]">{b.status}</Badge></div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {time}</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.applicant_email}</span>
                    {b.applicant_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.applicant_phone}</span>}
                  </div>
                </div>
                {b.zoom_join_url && (
                  <a href={b.zoom_join_url} target="_blank" rel="noreferrer">
                    <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                      <Video className="h-3 w-3" /> Join
                    </button>
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
