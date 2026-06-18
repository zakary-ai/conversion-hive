import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { listCloserSlotsForDate, createCloserBooking } from "@/lib/api/b2c.functions";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CalendarClock, CheckCircle2, Sparkles } from "lucide-react";

const searchSchema = z.object({
  app: z.string().uuid(),
  t: z.string().uuid(),
});

export const Route = createFileRoute("/apply/book")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Book your interview — Conversion Lab" },
      { name: "description", content: "Pick a time to talk with one of our closers." },
    ],
  }),
  component: BookPage,
});

function toDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function BookPage() {
  const { app, t } = Route.useSearch();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [date, setDate] = useState<Date | undefined>(today);
  const [selected, setSelected] = useState<Date | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dateKey = date ? toDateKey(date, tz) : null;
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["closer-slots", dateKey, tz],
    queryFn: () => listCloserSlotsForDate({ data: { date: dateKey!, tz } }),
    enabled: !!dateKey,
  });

  const book = useMutation({
    mutationFn: () => createCloserBooking({ data: {
      application_id: app, token: t, slot_start: selected!.toISOString(),
    } }),
    onSuccess: () => setDone(true),
    onError: (e: Error) => setErr(e.message),
  });

  const tzLabel = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;

  if (done) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <Card className="p-10 text-center max-w-md w-full">
          <div className="h-14 w-14 mx-auto rounded-full bg-success/20 text-success flex items-center justify-center mb-4">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-display font-semibold">You're booked!</h2>
          <p className="mt-3 text-muted-foreground">
            We received your booking. You'll receive a confirmation email with the Zoom link as soon as a closer is assigned.
          </p>
          <Link to="/" className="inline-block mt-6">
            <Button variant="outline">Back home</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="relative max-w-3xl mx-auto px-6 pt-16 pb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs uppercase tracking-widest text-primary mb-4">
            <Sparkles className="h-3 w-3" /> Application received
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-semibold tracking-tight">Pick your interview time</h1>
          <p className="mt-4 text-muted-foreground">Choose a 30-minute slot. We'll email you the Zoom link.</p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-10">
        <Card className="p-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-2 flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => { if (d) { setDate(d); setSelected(null); } }}
              disabled={(d) => d < today}
              className="pointer-events-auto"
            />
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2 text-sm font-medium min-w-0">
                <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {date ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Pick a date"}
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{tzLabel}</div>
            </div>
            {isLoading && <div className="text-sm text-muted-foreground">Loading times…</div>}
            {!isLoading && slots.length === 0 && (
              <div className="text-sm text-muted-foreground">No open times this day.</div>
            )}
            {slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {slots.map(({ iso, capacity }) => {
                  const d = new Date(iso);
                  const isSel = selected && d.getTime() === selected.getTime();
                  const label = new Intl.DateTimeFormat(undefined, {
                    timeZone: tz, hour: "numeric", minute: "2-digit",
                  }).format(d);
                  return (
                    <Button
                      key={iso}
                      type="button"
                      size="sm"
                      variant={isSel ? "default" : "outline"}
                      onClick={() => setSelected(d)}
                      className={cn("text-xs flex flex-col h-auto py-2", isSel && "ring-2 ring-primary")}
                    >
                      <span>{label}</span>
                      <span className="text-[9px] text-muted-foreground">{capacity} left</span>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button
            size="lg"
            className="w-full"
            disabled={!selected || book.isPending}
            onClick={() => { setErr(null); book.mutate(); }}
          >
            {book.isPending ? "Booking…" : selected ? "Confirm booking" : "Pick a time"}
          </Button>
        </Card>
      </section>
    </div>
  );
}
