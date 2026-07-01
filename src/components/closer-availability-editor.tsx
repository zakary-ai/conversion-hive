import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type Range = { start_minute: number; end_minute: number };
export type WeeklyDay = { day: number; enabled: boolean; ranges: Range[] };
export type Weekly = WeeklyDay[];

export function emptyWeekly(): Weekly {
  return Array.from({ length: 7 }, (_, i) => ({ day: i, enabled: false, ranges: [] }));
}

export function normalizeWeekly(w: unknown): Weekly {
  const base = emptyWeekly();
  if (!Array.isArray(w)) return base;
  for (const raw of w) {
    if (!raw || typeof raw !== "object") continue;
    const d = raw as Partial<WeeklyDay>;
    if (typeof d.day !== "number" || d.day < 0 || d.day > 6) continue;
    base[d.day] = {
      day: d.day,
      enabled: !!d.enabled,
      ranges: Array.isArray(d.ranges)
        ? d.ranges
            .filter(
              (r): r is Range =>
                !!r && typeof r.start_minute === "number" && typeof r.end_minute === "number",
            )
            .map((r) => ({ start_minute: r.start_minute, end_minute: r.end_minute }))
        : [],
    };
  }
  return base;
}

function toTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fromTime(s: string) {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function CloserAvailabilityEditor({
  weekly,
  notes,
  onChange,
  readOnly = false,
}: {
  weekly: Weekly;
  notes: string;
  onChange: (next: { weekly: Weekly; notes: string }) => void;
  readOnly?: boolean;
}) {
  const setDay = (dow: number, patch: Partial<WeeklyDay>) => {
    const next = weekly.map((d) => (d.day === dow ? { ...d, ...patch } : d));
    onChange({ weekly: next, notes });
  };
  const setRange = (dow: number, idx: number, patch: Partial<Range>) => {
    const next = weekly.map((d) =>
      d.day === dow
        ? { ...d, ranges: d.ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }
        : d,
    );
    onChange({ weekly: next, notes });
  };
  const addRange = (dow: number) => {
    const next = weekly.map((d) =>
      d.day === dow
        ? { ...d, ranges: [...d.ranges, { start_minute: 9 * 60, end_minute: 17 * 60 }] }
        : d,
    );
    onChange({ weekly: next, notes });
  };
  const removeRange = (dow: number, idx: number) => {
    const next = weekly.map((d) =>
      d.day === dow ? { ...d, ranges: d.ranges.filter((_, i) => i !== idx) } : d,
    );
    onChange({ weekly: next, notes });
  };
  const toggleDay = (dow: number, on: boolean) => {
    const day = weekly.find((d) => d.day === dow);
    const ranges =
      on && !day?.ranges.length ? [{ start_minute: 9 * 60, end_minute: 17 * 60 }] : day?.ranges ?? [];
    setDay(dow, { enabled: on, ranges });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {DAYS.map((label, dow) => {
          const d = weekly.find((x) => x.day === dow) ?? { day: dow, enabled: false, ranges: [] };
          return (
            <div key={dow} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={d.enabled}
                    onCheckedChange={(v) => toggleDay(dow, v)}
                    disabled={readOnly}
                  />
                  <div className="font-medium w-12">{label}</div>
                  {!d.enabled && (
                    <span className="text-xs text-muted-foreground">Unavailable</span>
                  )}
                </div>
                {d.enabled && !readOnly && (
                  <Button size="sm" variant="ghost" onClick={() => addRange(dow)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add range
                  </Button>
                )}
              </div>
              {d.enabled && (
                <div className="mt-2 space-y-2">
                  {d.ranges.length === 0 && (
                    <div className="text-xs text-muted-foreground">No ranges yet.</div>
                  )}
                  {d.ranges.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={toTime(r.start_minute)}
                        step={1800}
                        onChange={(e) =>
                          setRange(dow, idx, { start_minute: fromTime(e.target.value) })
                        }
                        className="w-32"
                        disabled={readOnly}
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input
                        type="time"
                        value={toTime(r.end_minute)}
                        step={1800}
                        onChange={(e) =>
                          setRange(dow, idx, { end_minute: fromTime(e.target.value) })
                        }
                        className="w-32"
                        disabled={readOnly}
                      />
                      {!readOnly && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeRange(dow, idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <p className="text-xs text-muted-foreground mb-2">
          Anything the admin should know — time off, preferences, exceptions.
        </p>
        <Textarea
          value={notes}
          onChange={(e) => onChange({ weekly, notes: e.target.value })}
          rows={4}
          placeholder="e.g. Out on Friday afternoons this month."
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
