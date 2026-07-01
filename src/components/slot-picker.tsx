import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAvailableSlots } from "@/lib/api/cl.functions";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarClock, Globe } from "lucide-react";

type Props = {
  value: Date | null;
  onChange: (d: Date) => void;
};

// Calendar is always based in EST so slot day buckets match the business calendar.
const BASE_TZ = "America/New_York";

const US_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

function toDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function SlotPicker({ value, onChange }: Props) {
  // Display timezone — defaults to EST, setter can switch to clarify booking time for the lead.
  const [displayTz, setDisplayTz] = useState<string>(BASE_TZ);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [date, setDate] = useState<Date | undefined>(value ?? undefined);

  // Slots are bucketed by the EST business day regardless of display tz.
  const dateKey = date ? toDateKey(date, BASE_TZ) : null;
  const { data: slots = [], isLoading, error, refetch } = useQuery({
    queryKey: ["available-slots", dateKey, BASE_TZ],
    queryFn: () => listAvailableSlots({ data: { date: dateKey!, tz: BASE_TZ } }),
    enabled: !!dateKey,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const tzShort = US_TIMEZONES.find((t) => t.value === displayTz)?.label ?? displayTz;

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
          <Select value={displayTz} onValueChange={setDisplayTz}>
            <SelectTrigger className="h-7 w-auto gap-1 px-2 text-[11px]">
              <Globe className="h-3 w-3 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {US_TIMEZONES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {displayTz !== BASE_TZ && (
          <div className="mb-2 text-[10px] text-muted-foreground">
            Times shown in {tzShort}. Calendar is based in Eastern (ET).
          </div>
        )}
        {!date && <div className="text-sm text-muted-foreground">Select a date to see open times.</div>}
        {date && isLoading && <div className="text-sm text-muted-foreground">Loading times…</div>}
        {date && !isLoading && slots.length === 0 && (
          <div className="text-sm text-muted-foreground">No open times this day.</div>
        )}
        {slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
            {slots.map((iso) => {
              const d = new Date(iso);
              const selected = value && d.getTime() === value.getTime();
              const label = new Intl.DateTimeFormat(undefined, {
                timeZone: displayTz, hour: "numeric", minute: "2-digit",
              }).format(d);
              return (
                <Button
                  key={iso}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => onChange(d)}
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
