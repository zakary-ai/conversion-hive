import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SlotPicker } from "@/components/slot-picker";
import { createAppointment, updateLead } from "@/lib/api/cl.functions";
import { toast } from "sonner";

type MinimalLead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

export function LeadBookingDialog({
  lead, open, onClose, onDone,
}: {
  lead: MinimalLead;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(lead.name ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [context, setContext] = useState("");
  const [when, setWhen] = useState<Date | null>(null);
  const [bookingTz, setBookingTz] = useState<string>("America/New_York");

  useEffect(() => {
    if (open) {
      setName(lead.name ?? "");
      setPhone(lead.phone ?? "");
      setEmail(lead.email ?? "");
      setContext("");
      setWhen(null);
      setBookingTz("America/New_York");
    }
  }, [open, lead.id, lead.name, lead.phone, lead.email]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!when) throw new Error("Pick a time slot");
      const trimmedEmail = email.trim();
      if (trimmedEmail && trimmedEmail !== (lead.email ?? "")) {
        await updateLead({ data: { id: lead.id, email: trimmedEmail } });
      }
      await createAppointment({ data: {
        lead_id: lead.id,
        type: "booking",
        scheduled_at: when.toISOString(),
        name,
        phone: phone || null,
        email: trimmedEmail || null,
        context: context || null,
        timezone: bookingTz,
      }});
      await updateLead({ data: { id: lead.id, status: "Booked", contacted: true } });
    },
    onSuccess: () => { toast.success("Appointment booked"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Book appointment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Required for confirmation email"
            />
          </Field>
          <Field label="Pick a time">
            <SlotPicker value={when} onChange={setWhen} tz={bookingTz} onTzChange={setBookingTz} />
          </Field>
          <Field label="Context">
            <Textarea rows={3} value={context} onChange={(e) => setContext(e.target.value)} placeholder="What does the lead need?" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={!name || !when || submit.isPending}>Book</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
