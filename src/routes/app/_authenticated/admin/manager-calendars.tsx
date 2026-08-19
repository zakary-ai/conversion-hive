import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminListManagerCalendars } from "@/lib/api/dm-manager.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarClock, Copy, Mail, Phone, Video, User } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/admin/manager-calendars")({
  component: AdminManagerCalendarsPage,
});

type Booking = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  scheduled_at: string;
  meeting_url: string | null;
  status: string;
};

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  link: string;
  bookings: Booking[];
};

type Event = Booking & { managerId: string; managerName: string };

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function AdminManagerCalendarsPage() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin-manager-calendars"],
    queryFn: () => adminListManagerCalendars(),
  });
  const rows = data as unknown as Row[];

  const [managerId, setManagerId] = useState<string>("all");
  const [date, setDate] = useState<Date | undefined>(new Date());

  const events = useMemo<Event[]>(() => {
    const list: Event[] = [];
    for (const m of rows) {
      if (managerId !== "all" && m.id !== managerId) continue;
      for (const b of m.bookings) {
        list.push({ ...b, managerId: m.id, managerName: m.full_name || m.email || "Manager" });
      }
    }
    return list.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [rows, managerId]);

  const bookedDays = useMemo(() => events.map((e) => new Date(e.scheduled_at)), [events]);
  const dayEvents = useMemo(
    () => (date ? events.filter((e) => sameDay(new Date(e.scheduled_at), date)) : []),
    [events, date],
  );
  const upcoming = useMemo(
    () => events.filter((e) => new Date(e.scheduled_at).getTime() > Date.now() && e.status !== "cancelled"),
    [events],
  );

  async function copy(link: string) {
    try { await navigator.clipboard.writeText(link); toast.success("Link copied"); }
    catch { toast.error("Copy failed"); }
  }

  const visibleManagers = managerId === "all" ? rows : rows.filter((m) => m.id === managerId);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold">Manager calendars</h1>
          <p className="text-sm text-muted-foreground">All DM setter manager 1-on-1 calls in one calendar.</p>
        </div>
        <Select value={managerId} onValueChange={setManagerId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All managers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All managers</SelectItem>
            {rows.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <Card className="p-4 text-sm text-destructive">{(error as Error).message}</Card>}
      {!isLoading && rows.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No managers yet.</Card>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{events.length} total calls</Badge>
            <Badge variant="outline">{upcoming.length} upcoming</Badge>
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
              {dayEvents.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">No calls this day.</Card>
              ) : (
                dayEvents.map((b) => (
                  <Card key={b.id} className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{b.name}</span>
                      <Badge variant="outline" className="text-[10px]">{b.status}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(b.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {b.managerName}</span>
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.email}</span>
                      {b.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.phone}</span>}
                      {b.meeting_url && (
                        <a href={b.meeting_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
                          <Video className="h-3 w-3" /> Join
                        </a>
                      )}
                    </div>
                  </Card>
                ))
              )}

              {upcoming.length > 0 && (
                <Card className="p-4">
                  <div className="text-sm font-medium mb-2">Next up</div>
                  <div className="space-y-1 text-xs">
                    {upcoming.slice(0, 6).map((b) => (
                      <div key={b.id} className="flex justify-between gap-2 border-b border-border/40 py-1">
                        <span className="truncate">{b.name} · {b.managerName}</span>
                        <span className="text-muted-foreground shrink-0">{new Date(b.scheduled_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>

          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium">Booking links</div>
            {visibleManagers.map((m) => (
              <div key={m.id} className="space-y-1">
                <div className="text-xs text-muted-foreground">{m.full_name || m.email}</div>
                <div className="flex gap-2 items-center">
                  <Input readOnly value={m.link} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="icon" variant="outline" onClick={() => copy(m.link)} title="Copy link">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
