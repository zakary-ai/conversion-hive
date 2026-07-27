import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAndClaimPoolLead } from "@/lib/api/b2b-pool.functions";
import { B2bBookingSlotDialog } from "@/components/b2b-booking-slot-dialog";
import { toast } from "sonner";

type CreatedLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export function BookNewLeadDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [created, setCreated] = useState<CreatedLead | null>(null);

  const reset = () => {
    setCompany(""); setName(""); setPhone(""); setEmail(""); setNotes("");
    setCreated(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required.");
      if (!email.trim() && !phone.trim()) throw new Error("Email or phone is required.");
      const parts = name.trim().split(/\s+/);
      const first = parts.shift() ?? "";
      const last = parts.join(" ");
      return createAndClaimPoolLead({
        data: {
          first_name: first || null,
          last_name: last || null,
          company: company.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        },
      });
    },
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
      setCreated({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        company: row.company,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  if (created) {
    return (
      <B2bBookingSlotDialog
        lead={created}
        open={open}
        onClose={handleClose}
        onBooked={handleClose}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book a new lead</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Add the lead to your pipeline and pick a time. The lead will be claimed under you.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Continue to time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
