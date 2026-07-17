import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { rescheduleCloserBooking } from "@/lib/api/b2c.functions";

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
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("09:00");

  const iso = useMemo(() => {
    if (!date || !time) return null;
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }, [date, time]);

  const reschedule = useMutation({
    mutationFn: (slot_start: string) => rescheduleCloserBooking({ data: { booking_id: bookingId, slot_start } }),
    onSuccess: () => {
      toast.success("Booking rescheduled");
      qc.invalidateQueries({ queryKey: ["closer-bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings-for-date"] });
      setDate(undefined);
      setTime("09:00");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setDate(undefined); setTime("09:00"); } onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule — {applicantName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              className="pointer-events-auto"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <Label htmlFor="reschedule-time">Time</Label>
            <Input
              id="reschedule-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              step={300}
            />
            <p className="text-xs text-muted-foreground">
              Any date and time is allowed. Interpreted in your local timezone.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!iso || reschedule.isPending}
            onClick={() => iso && reschedule.mutate(iso)}
          >
            {reschedule.isPending ? "Saving…" : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
