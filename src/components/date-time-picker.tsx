import { useEffect, useRef, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type Props = {
  value: Date;
  onChange: (d: Date) => void;
};

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export function DateTimePicker({ value, onChange }: Props) {
  const hour24 = value.getHours();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const minute = value.getMinutes();
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";

  const setDate = (d: Date | undefined) => {
    if (!d) return;
    const next = new Date(value);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    onChange(next);
  };
  const setHour12 = (h: number) => {
    const next = new Date(value);
    const base = h % 12; // 12 -> 0
    next.setHours(period === "PM" ? base + 12 : base);
    onChange(next);
  };
  const setMinute = (m: number) => {
    const next = new Date(value);
    next.setMinutes(m);
    onChange(next);
  };
  const setPeriod = (p: "AM" | "PM") => {
    if (p === period) return;
    const next = new Date(value);
    next.setHours(p === "PM" ? (hour12 % 12) + 12 : hour12 % 12);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-2 flex justify-center">
        <Calendar
          mode="single"
          selected={value}
          onSelect={setDate}
          className="pointer-events-auto"
        />
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-sm font-medium">Time</div>
          <div className="text-sm text-primary font-medium">
            {String(hour12)}:{String(minute).padStart(2, "0")} {period}
          </div>
        </div>
        <div className="relative h-[200px] overflow-hidden">
          {/* center selection highlight — row index 2 of 5 visible rows */}
          <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 h-10 rounded-lg bg-muted/60 ring-1 ring-border" />
          {/* fade masks */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent z-10" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent z-10" />
          <div className="grid grid-cols-3 h-full">
            <Wheel items={HOURS} value={hour12} onChange={setHour12} format={(n) => String(n)} />
            <Wheel items={MINUTES} value={minute} onChange={setMinute} format={(n) => String(n).padStart(2, "0")} />
            <Wheel items={["AM", "PM"] as const} value={period} onChange={(v) => setPeriod(v)} format={(v) => v} />
          </div>
        </div>
      </div>
    </div>
  );
}

const ITEM_H = 40;

function Wheel<T extends string | number>({
  items, value, onChange, format,
}: {
  items: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolling, setScrolling] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sync external value -> scroll position
  useEffect(() => {
    const idx = items.indexOf(value);
    if (idx < 0 || !ref.current) return;
    if (scrolling) return;
    ref.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
  }, [value, items, scrolling]);

  const settle = () => {
    if (!ref.current) return;
    const idx = Math.round(ref.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    ref.current.scrollTo({ top: clamped * ITEM_H, behavior: "auto" });
    setScrolling(false);
    const next = items[clamped];
    if (next !== value) onChange(next);
  };

  const handleScroll = () => {
    setScrolling(true);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(settle, 140);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    // Claim the wheel event so it doesn't scroll the parent dialog.
    e.stopPropagation();
    ref.current.scrollTop += e.deltaY;
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      onWheel={handleWheel}
      className="h-full overflow-y-scroll overscroll-contain snap-y snap-mandatory no-scrollbar text-center"
      style={{ scrollPaddingTop: ITEM_H * 2 }}
    >
      <div style={{ height: ITEM_H * 2 }} />
      {items.map((it) => (
        <button
          type="button"
          key={String(it)}
          onClick={() => onChange(it)}
          className={cn(
            "block w-full snap-center text-base tabular-nums transition-colors",
            it === value ? "text-foreground font-semibold" : "text-muted-foreground/60"
          )}
          style={{ height: ITEM_H, lineHeight: `${ITEM_H}px` }}
        >
          {format(it)}
        </button>
      ))}
      <div style={{ height: ITEM_H * 2 }} />
    </div>
  );
}
