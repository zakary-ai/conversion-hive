import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker } from "@/components/slot-picker";
import { createAndClaimPoolLead } from "@/lib/api/b2b-pool.functions";
import { bookB2bSlotForLead } from "@/lib/api/cl.functions";
import { toast } from "sonner";

export function BookNewLeadDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [slot, setSlot] = useState<Date | null>(null);
  const [tz, setTz] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  );
  const [step, setStep] = useState<"time" | "details">("time");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setSlot(null);
    setStep("time");
    setFirstName(""); setLastName(""); setCompany("");
    setPhone(""); setEmail(""); setNotes("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!slot) throw new Error("Pick a time first.");
      if (!firstName.trim()) throw new Error("First name is required.");
      if (!email.trim()) throw new Error("Email is required to book.");
      const lead: any = await createAndClaimPoolLead({
        data: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          company: company.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        },
      });
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
    onSuccess: (res: any) => {
      toast.success(res?.closer_name ? `Booked with ${res.closer_name}` : "Booked");
      qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
      qc.invalidateQueries({ queryKey: ["available-slots"] });
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <DialogTitle>Book a new lead</DialogTitle>
        </DialogHeader>

        {step === "time" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Pick a date and time first. A closer with a free calendar will be auto-assigned.
            </p>
            <SlotPicker value={slot} onChange={setSlot} tz={tz} onTzChange={setTz} />
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button disabled={!slot} onClick={() => setStep("details")}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {slotLabel && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm flex items-center justify-between gap-2">
                <span>Booking <span className="font-medium">{slotLabel}</span></span>
                <Button size="sm" variant="ghost" onClick={() => setStep("time")}>Change</Button>
              </div>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">First name <span className="text-destructive">*</span></Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Last name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Company</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("time")}>Back</Button>
              <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
                {submit.isPending ? "Booking…" : "Confirm booking"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
