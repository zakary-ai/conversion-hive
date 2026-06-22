import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getB2cSettings,
  updateB2cSettings,
  listB2cAvailability,
  replaceB2cAvailability,
  listBookingsForDate,
  listClosers,
  assignCloserToBooking,
  unassignCloser,
  cancelCloserBooking,
  deleteCloserBooking,
} from "@/lib/api/b2c.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, CalendarClock, Mail, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { ApplicationDetailDialog } from "@/components/application-detail-dialog";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Rule = { day_of_week: number; start_minute: number; end_minute: number };

function toTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fromTime(s: string) {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function B2cCalendarPanel() {
  const qc = useQueryClient();

  // Settings
  const { data: settings } = useQuery({
    queryKey: ["b2c-settings"],
    queryFn: () => getB2cSettings(),
  });
  const [slot, setSlot] = useState<number>(30);
  const [daysOut, setDaysOut] = useState<number>(14);
  useEffect(() => {
    if (settings) {
      setSlot(settings.slot_minutes);
      setDaysOut(settings.days_out);
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () =>
      updateB2cSettings({
        data: {
          slot_minutes: slot as 15 | 30 | 45 | 60 | 90 | 120,
          days_out: daysOut,
        },
      }),
    onSuccess: () => {
      toast.success("Booking settings saved");
      qc.invalidateQueries({ queryKey: ["b2c-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Weekly availability
  const { data: existing } = useQuery({
    queryKey: ["b2c-availability"],
    queryFn: () => listB2cAvailability(),
  });
  const [byDay, setByDay] = useState<Record<number, Rule[]>>({});
  useEffect(() => {
    if (!existing) return;
    const next: Record<number, Rule[]> = {};
    for (const r of existing) {
      (next[r.day_of_week] ??= []).push({
        day_of_week: r.day_of_week,
        start_minute: r.start_minute,
        end_minute: r.end_minute,
      });
    }
    setByDay(next);
  }, [existing]);

  const saveAvailability = useMutation({
    mutationFn: async () => {
      const rules: Rule[] = [];
      for (const list of Object.values(byDay))
        for (const r of list) if (r.end_minute > r.start_minute) rules.push(r);
      await replaceB2cAvailability({ data: { rules } });
    },
    onSuccess: () => {
      toast.success("Availability saved");
      qc.invalidateQueries({ queryKey: ["b2c-availability"] });
      qc.invalidateQueries({ queryKey: ["closer-slots"] });
      qc.invalidateQueries({ queryKey: ["public-closer-slots"] });
      qc.invalidateQueries({ queryKey: ["bookings-for-date"] });
      qc.invalidateQueries({ queryKey: ["public-booking-window"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDay = (dow: number, on: boolean) => {
    setByDay((b) => {
      const next = { ...b };
      if (on)
        next[dow] = next[dow]?.length
          ? next[dow]
          : [{ day_of_week: dow, start_minute: 9 * 60, end_minute: 17 * 60 }];
      else delete next[dow];
      return next;
    });
  };
  const updateRange = (dow: number, idx: number, patch: Partial<Rule>) => {
    setByDay((b) => {
      const list = [...(b[dow] ?? [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...b, [dow]: list };
    });
  };
  const addRange = (dow: number) => {
    setByDay((b) => ({
      ...b,
      [dow]: [
        ...(b[dow] ?? []),
        { day_of_week: dow, start_minute: 9 * 60, end_minute: 17 * 60 },
      ],
    }));
  };
  const removeRange = (dow: number, idx: number) => {
    setByDay((b) => {
      const list = (b[dow] ?? []).filter((_, i) => i !== idx);
      const next = { ...b };
      if (list.length === 0) delete next[dow];
      else next[dow] = list;
      return next;
    });
  };

  // Date picker for bookings
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  const selectedKey = useMemo(() => (selected ? dateKey(selected) : null), [selected]);
  const { data: dayBookings = [] } = useQuery({
    queryKey: ["bookings-for-date", selectedKey],
    queryFn: () =>
      listBookingsForDate({
        data: {
          date: selectedKey!,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    enabled: !!selectedKey,
  });

  const { data: closers = [] } = useQuery({
    queryKey: ["closers"],
    queryFn: () => listClosers(),
  });

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card className="p-4 space-y-4">
        <div>
          <h3 className="font-display font-semibold">Booking settings</h3>
          <p className="text-xs text-muted-foreground">
            Controls the calendar shown to leads on the apply page.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Time between calls</label>
            <p className="text-xs text-muted-foreground mb-2">
              Calls start every N minutes. e.g. 30 → 3:00, 3:30, 4:00.
            </p>
            <Select value={String(slot)} onValueChange={(v) => setSlot(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="90">1.5 hours</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Days out</label>
            <p className="text-xs text-muted-foreground mb-2">
              How many days in advance a lead can book.
            </p>
            <Input
              type="number"
              min={1}
              max={180}
              value={daysOut}
              onChange={(e) => setDaysOut(Number(e.target.value) || 1)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save settings
          </Button>
        </div>
      </Card>

      {/* Weekly availability */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-display font-semibold">
              Weekly availability{" "}
              <span className="text-xs font-normal text-muted-foreground">(Eastern Time)</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Leads can only book inside these windows. Leave a day off to block it entirely.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => saveAvailability.mutate()}
            disabled={saveAvailability.isPending}
          >
            <Save className="h-4 w-4 mr-1" /> Save availability
          </Button>
        </div>

        <div className="space-y-3">
          {DAYS.map((label, dow) => {
            const enabled = !!byDay[dow];
            const ranges = byDay[dow] ?? [];
            return (
              <div key={dow} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch checked={enabled} onCheckedChange={(v) => toggleDay(dow, v)} />
                    <div className="font-medium w-12">{label}</div>
                  </div>
                  {enabled && (
                    <Button size="sm" variant="ghost" onClick={() => addRange(dow)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add range
                    </Button>
                  )}
                </div>
                {enabled && (
                  <div className="mt-2 space-y-2">
                    {ranges.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={toTime(r.start_minute)}
                          step={1800}
                          onChange={(e) =>
                            updateRange(dow, idx, { start_minute: fromTime(e.target.value) })
                          }
                          className="w-32"
                        />
                        <span className="text-muted-foreground text-sm">to</span>
                        <Input
                          type="time"
                          value={toTime(r.end_minute)}
                          step={1800}
                          onChange={(e) =>
                            updateRange(dow, idx, { end_minute: fromTime(e.target.value) })
                          }
                          className="w-32"
                        />
                        <Button size="icon" variant="ghost" onClick={() => removeRange(dow, idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Date → bookings */}
      <Card className="p-4">
        <div className="grid md:grid-cols-[auto_1fr] gap-6">
          <div>
            <h3 className="font-display font-semibold mb-2">Pick a date</h3>
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setSelected}
              className="rounded-md border"
            />
          </div>
          <div>
            <h3 className="font-display font-semibold mb-2">
              {selected
                ? selected.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                : "Select a date"}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Bookings on this day. Assign a closer to any unassigned ones.
            </p>
            <DayBookingList bookings={dayBookings} closers={closers} />
          </div>
        </div>
      </Card>
    </div>
  );
}

type DayBooking = {
  id: string;
  application_id: string | null;
  slot_start: string;
  status: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  closers?: { full_name: string; email: string } | null;
};
type CloserOpt = { id: string; full_name: string; active: boolean };

function DayBookingList({
  bookings,
  closers,
}: {
  bookings: DayBooking[];
  closers: CloserOpt[];
}) {
  if (bookings.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
        No bookings on this day.
      </div>
    );
  }
  const unassigned = bookings.filter((b) => b.status === "pending_assignment");
  const others = bookings.filter((b) => b.status !== "pending_assignment");
  return (
    <div className="space-y-4">
      {unassigned.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-xs uppercase tracking-widest text-muted-foreground">
              Needs assignment
            </h4>
            <Badge variant="secondary">{unassigned.length}</Badge>
          </div>
          <div className="space-y-2">
            {unassigned.map((b) => (
              <DayBookingRow key={b.id} booking={b} closers={closers} />
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Other</h4>
            <Badge variant="secondary">{others.length}</Badge>
          </div>
          <div className="space-y-2">
            {others.map((b) => (
              <DayBookingRow key={b.id} booking={b} closers={closers} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayBookingRow({ booking, closers }: { booking: DayBooking; closers: CloserOpt[] }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bookings-for-date"] });
    qc.invalidateQueries({ queryKey: ["closer-bookings"] });
  };
  const assign = useMutation({
    mutationFn: (closer_id: string) =>
      assignCloserToBooking({ data: { booking_id: booking.id, closer_id } }),
    onSuccess: () => {
      toast.success("Closer assigned");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unassign = useMutation({
    mutationFn: () => unassignCloser({ data: { booking_id: booking.id } }),
    onSuccess: () => {
      toast.success("Unassigned");
      invalidate();
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelCloserBooking({ data: { booking_id: booking.id } }),
    onSuccess: () => {
      toast.success("Cancelled");
      invalidate();
    },
  });
  const del = useMutation({
    mutationFn: () => deleteCloserBooking({ data: { booking_id: booking.id } }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const dt = new Date(booking.slot_start);
  const time = dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {booking.application_id ? (
            <button
              type="button"
              onClick={() => setOpenAppId(booking.application_id)}
              className="font-medium text-left hover:underline text-primary"
            >
              {booking.applicant_name}
            </button>
          ) : (
            <div className="font-medium">{booking.applicant_name}</div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" /> {time}
            </span>
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" /> {booking.applicant_email}
            </span>
            {booking.applicant_phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {booking.applicant_phone}
              </span>
            )}
          </div>
          {booking.closers && (
            <div className="text-xs text-muted-foreground mt-1">
              Closer: <span className="text-foreground">{booking.closers.full_name}</span>
            </div>
          )}
          <div className="mt-1">
            <Badge variant="outline" className="text-[10px] uppercase">
              {booking.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {booking.status === "pending_assignment" && (
            <Select onValueChange={(id) => assign.mutate(id)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Assign closer…" />
              </SelectTrigger>
              <SelectContent>
                {closers.filter((c) => c.active).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
                {closers.filter((c) => c.active).length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No active closers
                  </div>
                )}
              </SelectContent>
            </Select>
          )}
          {booking.status === "assigned" && (
            <Button size="sm" variant="outline" onClick={() => unassign.mutate()}>
              Reassign
            </Button>
          )}
          {(booking.status === "pending_assignment" || booking.status === "assigned") && (
            <Button size="icon" variant="ghost" onClick={() => cancel.mutate()} title="Cancel">
              <X className="h-4 w-4" />
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the booking for <strong>{booking.applicant_name}</strong> and deletes the Google Calendar event. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={del.isPending}
                  onClick={(e) => { e.preventDefault(); del.mutate(); }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {del.isPending ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

      </div>
      <ApplicationDetailDialog
        applicationId={openAppId}
        open={!!openAppId}
        onOpenChange={(v) => !v && setOpenAppId(null)}
      />
    </Card>
  );
}
