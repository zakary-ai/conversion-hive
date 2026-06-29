import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarClock, Globe } from "lucide-react";

type Props = {
  value: Date | null;
  onChange: (d: Date) => void;
  tz: string;
  onTzChange: (tz: string) => void;
};

const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

const START_HOUR = 8; // 8 AM
const END_HOUR = 20; // 8 PM (inclusive of 8:00 PM start? we stop before 8:30 PM)
const STEP_MIN = 30;

// Build a UTC Date representing a wall-clock time (y/m/d h:m) in the given tz.
function wallToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  // Iteratively converge: start from naive UTC, measure the tz offset at that instant, correct.
  let utc = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date(utc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const tzWall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    const diff = tzWall - utc;
    if (diff === 0) break;
    utc -= diff;
  }
  return new Date(utc);
}

export function CallbackSlotPicker({ value, onChange, tz, onTzChange }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [date, setDate] = useState<Date | undefined>(value ?? new Date());

  const slots = useMemo(() => {
    if (!date) return [];
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const result: Date[] = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      for (let min = 0; min < 60; min += STEP_MIN) {
        result.push(wallToUtc(y, m, d, h, min, tz));
      }
    }
    // include 8:00 PM as final slot
    result.push(wallToUtc(y, m, d, END_HOUR, 0, tz));
    return result;
  }, [date, tz]);

  const now = Date.now();

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-2 flex justify-center">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => { if (d) setDate(d); }}
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
          <Select value={tz} onValueChange={onTzChange}>
            <SelectTrigger className="h-7 w-auto gap-1 px-2 text-[11px]">
              <Globe className="h-3 w-3 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!date && <div className="text-sm text-muted-foreground">Select a date to see times.</div>}
        {date && (
          <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
            {slots.map((slot) => {
              const past = slot.getTime() < now;
              const selected = value && slot.getTime() === value.getTime();
              const label = new Intl.DateTimeFormat(undefined, {
                timeZone: tz, hour: "numeric", minute: "2-digit",
              }).format(slot);
              return (
                <Button
                  key={slot.toISOString()}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  disabled={past}
                  onClick={() => onChange(slot)}
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
  );
}
