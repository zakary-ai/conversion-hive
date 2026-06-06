import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SlotPicker } from "@/components/slot-picker";
import { rescheduleAppointment } from "@/lib/api/cl.functions";
import { toast } from "sonner";

type Props = {
  apptId: string | null;
  currentScheduledAt?: string;
  onClose: () => void;
};

export function RescheduleDialog({ apptId, currentScheduledAt, onClose }: Props) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Date | null>(
    currentScheduledAt ? new Date(currentScheduledAt) : null
  );

  const m = useMutation({
    mutationFn: (scheduled_at: string) =>
      rescheduleAppointment({ data: { id: apptId!, scheduled_at } }),
    onSuccess: () => {
      toast.success("Rescheduled");
      qc.invalidateQueries({ queryKey: ["my-appointments"] });
      qc.invalidateQueries({ queryKey: ["all-appointments"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!apptId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
        </DialogHeader>
        <SlotPicker value={picked} onChange={setPicked} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!picked || m.isPending}
            onClick={() => picked && m.mutate(picked.toISOString())}
          >
            {m.isPending ? "Saving…" : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
