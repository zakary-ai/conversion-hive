import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import {
  CloserAvailabilityEditor,
  emptyWeekly,
  normalizeWeekly,
  type Weekly,
} from "./closer-availability-editor";
import {
  getMyB2bBookingAvailability,
  saveMyB2bBookingAvailability,
} from "@/lib/api/b2b-closers.functions";

/**
 * Real booking availability for a B2B closer. Slots are only offered to setters
 * and public booking links when they fall inside these windows AND the closer's
 * Google Calendar is free.
 */
export function B2bBookingAvailabilitySection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-b2b-booking-availability"],
    queryFn: () => getMyB2bBookingAvailability(),
  });

  const [open, setOpen] = useState(false);
  const [weekly, setWeekly] = useState<Weekly>(emptyWeekly());

  useEffect(() => {
    setWeekly(normalizeWeekly(data?.weekly ?? []));
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveMyB2bBookingAvailability({ data: { weekly } }),
    onSuccess: () => {
      toast.success("Booking availability saved");
      qc.invalidateQueries({ queryKey: ["my-b2b-booking-availability"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return null;

  const anyEnabled = weekly.some((d) => d.enabled && d.ranges.length > 0);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-start gap-2 text-left min-w-0 flex-1"
          aria-expanded={open}
        >
          <ChevronDown
            className={`h-4 w-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <div className="min-w-0">
            <h3 className="font-display font-semibold">
              My booking hours{" "}
              <span className="text-xs font-normal text-muted-foreground">(controls real slots)</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {anyEnabled
                ? "Setters can only book you inside these hours, and only when your Google Calendar is free (times in ET)."
                : "No hours set — you can currently be booked any time the team window is open and your calendar is free."}
            </p>
          </div>
        </button>
        {open && (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        )}
      </div>
      {open && (
        <CloserAvailabilityEditor
          weekly={weekly}
          notes=""
          onChange={(v) => setWeekly(v.weekly)}
        />
      )}
    </Card>
  );
}
