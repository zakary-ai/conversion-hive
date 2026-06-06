import { useState, useMemo } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { listAvailableSlots } from "@/lib/api/cl.functions";
import { meQueryOptions } from "@/routes/_authenticated/route";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarClock } from "lucide-react";

type Props = {
  value: Date | null;
  onChange: (d: Date) => void;
};

function toDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function SlotPicker({ value, onChange }: Props) {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const tz = (me.profile as unknown as { timezone?: string } | null)?.timezone || "America/New_York";

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [date, setDate] = useState<Date | undefined>(value ?? undefined);

  const dateKey = date ? toDateKey(date, tz) : null;
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["available-slots", dateKey, tz],
    queryFn: () => listAvailableSlots({ data: { date: dateKey!, tz } }),
    enabled: !!dateKey,
  });

  const tzLabel = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;

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
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">{tzLabel}</div>
        </div>
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
                timeZone: tz, hour: "numeric", minute: "2-digit",
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
