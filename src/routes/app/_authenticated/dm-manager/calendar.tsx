import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMyManagerCalendar, saveMyManagerAvailability, updateMyManagerBooking } from "@/lib/api/dm-manager.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { CalendarClock, Copy, Mail, Phone, Video } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/dm-manager/calendar")({
  component: ManagerCalendarPage,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Booking = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  scheduled_at: string;
  timezone: string | null;
  meeting_url: string | null;
  status: string;
  notes: string | null;
};

type DayState = { enabled: boolean; start: string; end: string };

function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function ManagerCalendarPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["my-manager-calendar"], queryFn: () => getMyManagerCalendar() });
  const bookings = (data?.bookings ?? []) as Booking[];

  const [days, setDays] = useState<DayState[]>(
    DAYS.map(() => ({ enabled: false, start: "09:00", end: "17:00" })),
  );
  const [date, setDate] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (!data?.rules) return;
    const next: DayState[] = DAYS.map(() => ({ enabled: false, start: "09:00", end: "17:00" }));
    for (const r of data.rules as { day_of_week: number; start_minute: number; end_minute: number }[]) {
      next[r.day_of_week] = { enabled: true, start: minutesToTime(r.start_minute), end: minutesToTime(r.end_minute) };
    }
    setDays(next);
  }, [data?.rules]);

  const save = useMutation({
    mutationFn: () =>
      saveMyManagerAvailability({
        data: {
          rules: days
            .map((d, i) => ({ day_of_week: i, start_minute: timeToMinutes(d.start), end_minute: timeToMinutes(d.end), enabled: d.enabled }))
            .filter((d) => d.enabled)
            .map(({ day_of_week, start_minute, end_minute }) => ({ day_of_week, start_minute, end_minute })),
        },
      }),
    onSuccess: () => { toast.success("Availability saved"); qc.invalidateQueries({ queryKey: ["my-manager-calendar"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "scheduled" | "completed" | "cancelled" | "no_show" }) =>
      updateMyManagerBooking({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["my-manager-calendar"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bookedDays = useMemo(() => bookings.map((b) => new Date(b.scheduled_at)), [bookings]);
  const dayRows = useMemo(
    () => (date ? bookings.filter((b) => sameDay(new Date(b.scheduled_at), date)) : []),
    [bookings, date],
  );

  const link = data?.manager.link ?? "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Booking link copied");
    } catch {
      toast.error("Copy failed — long-press the link to copy");
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4">
      <div>
        <h1 className="text-2xl font-display font-semibold">My calendar</h1>
        <p className="text-sm text-muted-foreground">Share your link and people can book a 1-on-1 call with you.</p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <Card className="p-4 text-sm text-destructive">{(error as Error).message}</Card>}

      {data && (
        <>
          <Card className="p-4 space-y-2">
            <div className="text-sm font-medium">Your booking link</div>
            <div className="flex gap-2 items-center">
              <Input readOnly value={link} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button size="icon" variant="outline" onClick={copyLink} title="Copy link"><Copy className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Bookings are 30 minutes and hours are set in Eastern time.</p>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium">Weekly availability (ET)</div>
            <div className="space-y-2">
              {days.map((d, i) => (
                <div key={i} className="flex items-center gap-3 flex-wrap">
                  <Switch
                    checked={d.enabled}
                    onCheckedChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, enabled: v } : x)))}
                  />
                  <span className="w-24 text-sm">{DAYS[i]}</span>
                  <Select value={d.start} onValueChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, start: v } : x)))}>
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 48 }, (_, k) => minutesToTime(k * 30)).map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">to</span>
                  <Select value={d.end} onValueChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, end: v } : x)))}>
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 48 }, (_, k) => minutesToTime(k * 30)).map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save availability"}
            </Button>
          </Card>

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
              {dayRows.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">No calls this day.</Card>
              )}
              {dayRows.map((b) => (
                <Card key={b.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{b.name}</span>
                    <Badge variant="outline" className="text-[10px]">{b.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />
                      {new Date(b.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.email}</span>
                    {b.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.phone}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {b.meeting_url && (
                      <a href={b.meeting_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                        <Video className="h-3 w-3" /> Join call
                      </a>
                    )}
                    <Select value={b.status} onValueChange={(v) => setStatus.mutate({ id: b.id, status: v as "scheduled" })}>
                      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled" className="text-xs">Scheduled</SelectItem>
                        <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                        <SelectItem value="no_show" className="text-xs">No show</SelectItem>
                        <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
