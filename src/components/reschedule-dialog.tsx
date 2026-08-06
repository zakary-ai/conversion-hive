import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { rescheduleAppointment } from "@/lib/api/cl.functions";
import { toast } from "sonner";

type Props = {
  apptId: string | null;
  currentScheduledAt?: string;
  onClose: () => void;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function RescheduleDialog({ apptId, currentScheduledAt, onClose }: Props) {
  const qc = useQueryClient();
  const current = currentScheduledAt ? new Date(currentScheduledAt) : null;
  const [date, setDate] = useState<Date | undefined>(current ?? undefined);
  const [time, setTime] = useState<string>(
    current ? `${pad(current.getHours())}:${pad(current.getMinutes())}` : "09:00",
  );

  useEffect(() => {
    if (!apptId) return;
    const c = currentScheduledAt ? new Date(currentScheduledAt) : null;
    setDate(c ?? undefined);
    setTime(c ? `${pad(c.getHours())}:${pad(c.getMinutes())}` : "09:00");
  }, [apptId, currentScheduledAt]);

  const iso = useMemo(() => {
    if (!date || !time) return null;
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }, [date, time]);

  const m = useMutation({
    mutationFn: (scheduled_at: string) =>
      rescheduleAppointment({ data: { id: apptId!, scheduled_at, silent: true } }),
    onSuccess: () => {
      toast.success("Rescheduled");
      qc.invalidateQueries({ queryKey: ["my-appointments"] });
      qc.invalidateQueries({ queryKey: ["all-appointments"] });
      qc.invalidateQueries({ queryKey: ["b2b-bookings"] });
      qc.invalidateQueries({ queryKey: ["b2b-bookings-for-date"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quick = (days: number) => {
    const base = date ?? new Date();
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    setDate(d);
  };

  const preview = iso
    ? new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <Dialog open={!!apptId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule / follow up</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => quick(1)}>+1 day</Button>
            <Button size="sm" variant="secondary" onClick={() => quick(3)}>+3 days</Button>
            <Button size="sm" variant="secondary" onClick={() => quick(7)}>+1 week</Button>
          </div>

          <div className="rounded-xl border border-border bg-card p-2 flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              className="pointer-events-auto"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <Label htmlFor="b2b-reschedule-time">Pick any time</Label>
            <div className="flex items-center gap-2">
              <Input
                id="b2b-reschedule-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step={60}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">24h</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Any date and time is allowed — not limited to availability windows. Interpreted in your local
              timezone. No email or notification is sent to the lead.
            </p>
          </div>

          {preview && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              New time: <span className="font-medium">{preview}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!iso || m.isPending} onClick={() => iso && m.mutate(iso)}>
            {m.isPending ? "Saving…" : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
