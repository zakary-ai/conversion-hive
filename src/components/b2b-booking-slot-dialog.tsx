import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SlotPicker } from "@/components/slot-picker";
import { bookB2bSlotForLead } from "@/lib/api/cl.functions";
import { toast } from "sonner";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export function B2bBookingSlotDialog({
  lead,
  open,
  onClose,
  onBooked,
}: {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onBooked?: () => void;
}) {
  const qc = useQueryClient();
  const [slot, setSlot] = useState<Date | null>(null);
  const [tz, setTz] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  );

  const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "lead";

  const book = useMutation({
    mutationFn: async () => {
      if (!slot) throw new Error("Pick a time first.");
      return bookB2bSlotForLead({
        data: {
          pool_lead_id: lead.id,
          scheduled_at: slot.toISOString(),
          timezone: tz,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.closer_name
          ? `Booked with ${res.closer_name}`
          : "Booked",
      );
      qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
      qc.invalidateQueries({ queryKey: ["my-didnt-pick-up"] });
      qc.invalidateQueries({ queryKey: ["my-callbacks"] });
      qc.invalidateQueries({ queryKey: ["pool-lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["available-slots"] });
      setSlot(null);
      onBooked?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClose = () => {
    setSlot(null);
    onClose();
  };

  const slotLabel = slot
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(slot)
    : null;

  if (!lead.email) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Book {name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This lead has no email on file. Add an email to their profile before
            booking.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book {name}</DialogTitle>
        </DialogHeader>
        <SlotPicker value={slot} onChange={setSlot} tz={tz} onTzChange={setTz} />
        {slotLabel && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            Booking <span className="font-medium">{slotLabel}</span>. A closer with a
            free calendar will be auto-assigned.
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button disabled={!slot || book.isPending} onClick={() => book.mutate()}>
            {book.isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
