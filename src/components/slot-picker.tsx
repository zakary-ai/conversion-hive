import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAvailableSlots } from "@/lib/api/cl.functions";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarClock } from "lucide-react";

type Props = {
  value: Date | null;
  onChange: (d: Date) => void;
};

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SlotPicker({ value, onChange }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [date, setDate] = useState<Date | undefined>(value ?? undefined);

  const dateKey = date ? toDateKey(date) : null;
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["available-slots", dateKey],
    queryFn: () => listAvailableSlots({ data: { date: dateKey! } }),
    enabled: !!dateKey,
  });

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
        <div className="flex items-center gap-2 mb-2 text-sm font-medium">
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
            {slots.map((iso) => {
              const d = new Date(iso);
              const selected = value && d.getTime() === value.getTime();
              return (
                <Button
                  key={iso}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => onChange(d)}
                  className={cn("text-xs", selected && "ring-2 ring-primary")}
                >
                  {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
