import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAvailabilityRules, replaceAvailabilityRules } from "@/lib/api/cl.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

type Rule = { day_of_week: number; start_minute: number; end_minute: number };

function toTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function fromTime(s: string) {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function AvailabilityEditor() {
  const qc = useQueryClient();
  const { data: existing = [] } = useQuery({
    queryKey: ["availability-rules"],
    queryFn: () => listAvailabilityRules(),
  });
  // group by day
  const [byDay, setByDay] = useState<Record<number, Rule[]>>({});

  useEffect(() => {
    const next: Record<number, Rule[]> = {};
    for (const r of existing) {
      (next[r.day_of_week] ??= []).push({ day_of_week: r.day_of_week, start_minute: r.start_minute, end_minute: r.end_minute });
    }
    setByDay(next);
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const rules: Rule[] = [];
      for (const list of Object.values(byDay)) for (const r of list) {
        if (r.end_minute > r.start_minute) rules.push(r);
      }
      await replaceAvailabilityRules({ data: { rules } });
    },
    onSuccess: () => {
      toast.success("Availability saved");
      qc.invalidateQueries({ queryKey: ["availability-rules"] });
      qc.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDay = (dow: number, on: boolean) => {
    setByDay((b) => {
      const next = { ...b };
      if (on) next[dow] = next[dow]?.length ? next[dow] : [{ day_of_week: dow, start_minute: 9*60, end_minute: 17*60 }];
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
    setByDay((b) => ({ ...b, [dow]: [...(b[dow] ?? []), { day_of_week: dow, start_minute: 9*60, end_minute: 17*60 }] }));
  };

  const removeRange = (dow: number, idx: number) => {
    setByDay((b) => {
      const list = (b[dow] ?? []).filter((_, i) => i !== idx);
      const next = { ...b };
      if (list.length === 0) delete next[dow]; else next[dow] = list;
      return next;
    });
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold">Booking availability</h3>
          <p className="text-xs text-muted-foreground">Setters can only book leads into 30-minute slots in these windows.</p>
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 mr-1" /> Save
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
                      <Input type="time" value={toTime(r.start_minute)} step={1800}
                        onChange={(e) => updateRange(dow, idx, { start_minute: fromTime(e.target.value) })}
                        className="w-32" />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input type="time" value={toTime(r.end_minute)} step={1800}
                        onChange={(e) => updateRange(dow, idx, { end_minute: fromTime(e.target.value) })}
                        className="w-32" />
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
  );
}
