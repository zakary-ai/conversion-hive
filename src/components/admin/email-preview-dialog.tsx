import { useEffect, useState } from "react";
import { render } from "@react-email/components";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BookingConfirmationEmail } from "@/lib/email-templates/booking-confirmation";

export function EmailPreviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    Promise.resolve(
      render(
        <BookingConfirmationEmail
          name="Alex"
          scheduledLabel="Tuesday, June 30, 2026 at 2:00 PM EDT"
          meetingUrl="https://zoom.us/j/123456789"
          durationMinutes={30}
        />
      )
    ).then((out) => setHtml(typeof out === "string" ? out : ""));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Booking confirmation email</DialogTitle>
          <DialogDescription>
            This is what the lead receives once a closer is assigned to a B2B booking.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border overflow-hidden bg-white">
          <iframe
            title="Email preview"
            srcDoc={html}
            className="w-full"
            style={{ height: 620, border: 0 }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
