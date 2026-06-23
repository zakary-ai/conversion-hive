import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listCloserSlotsForDate,
  getPublicBookingWindow,
  rescheduleCloserBooking,
} from "@/lib/api/b2c.functions";

function toDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function BookingRescheduleDialog({
  bookingId,
  applicantName,
  open,
  onOpenChange,
}: {
  bookingId: string;
  applicantName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", []);
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);

  const { data: window } = useQuery({
    queryKey: ["public-booking-window"],
    queryFn: () => getPublicBookingWindow(),
    enabled: open,
  });

  const horizonEnd = useMemo(() => {
    const days = window?.days_out ?? 30;
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  }, [window?.days_out, today]);

  const estDow = (d: Date) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
    return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(name);
  };
  const isDayClosed = (d: Date) => {
    if (!window) return false;
    if (window.open_weekdays === null) return false;
    return !window.open_weekdays.includes(estDow(d));
  };

  const dateKey = date ? toDateKey(date, tz) : null;
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["reschedule-slots", dateKey, tz],
    queryFn: () => listCloserSlotsForDate({ data: { date: dateKey!, tz } }),
    enabled: !!dateKey && open,
    staleTime: 0,
  });

  const reschedule = useMutation({
    mutationFn: (iso: string) => rescheduleCloserBooking({ data: { booking_id: bookingId, slot_start: iso } }),
    onSuccess: () => {
      toast.success("Booking rescheduled");
      qc.invalidateQueries({ queryKey: ["closer-bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings-for-date"] });
      qc.invalidateQueries({ queryKey: ["reschedule-slots"] });
      setDate(undefined); setPicked(null);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setDate(undefined); setPicked(null); } onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule — {applicantName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => { if (d) { setDate(d); setPicked(null); } }}
              disabled={(d) => d < today || d > horizonEnd || isDayClosed(d)}
              toDate={horizonEnd}
              className="pointer-events-auto"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {date ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Pick a date"}
            </div>
            {!date && <div className="text-sm text-muted-foreground">Select a date to see open times.</div>}
            {date && isLoading && <div className="text-sm text-muted-foreground">Loading times…</div>}
            {date && !isLoading && slots.length === 0 && (
              <div className="text-sm text-muted-foreground">No open times this day.</div>
            )}
            {slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                {slots.map((s) => {
                  const d = new Date(s.iso);
                  const selected = picked === s.iso;
                  const label = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
                  return (
                    <Button
                      key={s.iso}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() => setPicked(s.iso)}
                      className={cn("text-xs", selected && "ring-2 ring-primary")}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!picked || reschedule.isPending}
            onClick={() => picked && reschedule.mutate(picked)}
          >
            {reschedule.isPending ? "Saving…" : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
