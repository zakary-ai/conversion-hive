import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotPicker } from "@/components/slot-picker";
import { bookB2bSlotForLead } from "@/lib/api/cl.functions";
import { toast } from "sonner";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone?: string | null;
  company?: string | null;
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

  // Editable lead details, prefilled from the lead.
  const [firstName, setFirstName] = useState(lead.first_name ?? "");
  const [lastName, setLastName] = useState(lead.last_name ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [company, setCompany] = useState(lead.company ?? "");

  useEffect(() => {
    if (!open) return;
    setFirstName(lead.first_name ?? "");
    setLastName(lead.last_name ?? "");
    setEmail(lead.email ?? "");
    setPhone(lead.phone ?? "");
    setCompany(lead.company ?? "");
  }, [open, lead]);

  const displayName = `${firstName} ${lastName}`.trim() || "lead";

  const book = useMutation({
    mutationFn: async () => {
      if (!slot) throw new Error("Pick a time first.");
      if (!email.trim()) throw new Error("Email is required to book.");
      return bookB2bSlotForLead({
        data: {
          pool_lead_id: lead.id,
          scheduled_at: slot.toISOString(),
          timezone: tz,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(res.closer_name ? `Booked with ${res.closer_name}` : "Booked");
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book {displayName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Confirm lead details
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">First name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <SlotPicker value={slot} onChange={setSlot} tz={tz} onTzChange={setTz} />
        </div>

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
