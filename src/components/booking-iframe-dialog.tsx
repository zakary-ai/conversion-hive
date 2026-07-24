import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const IFRAME_SRC = "https://api.leadconnectorhq.com/widget/booking/JG2Vhe5FptIczfb90H1x";

let scriptLoaded = false;
function ensureScript() {
  if (scriptLoaded || typeof document === "undefined") return;
  if (document.querySelector('script[data-form-embed="1"]')) { scriptLoaded = true; return; }
  const s = document.createElement("script");
  s.src = "https://link.msgsndr.com/js/form_embed.js";
  s.async = true;
  s.setAttribute("data-form-embed", "1");
  document.body.appendChild(s);
  scriptLoaded = true;
}

export function BookingIframeDialog({
  open, onClose, leadName,
}: { open: boolean; onClose: () => void; leadName?: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => { if (open) ensureScript(); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Book {leadName || "lead"}</DialogTitle>
        </DialogHeader>
        <div className="px-2 pb-2">
          <iframe
            ref={ref}
            src={IFRAME_SRC}
            style={{ width: "100%", border: "none", height: "70vh" }}
            scrolling="yes"
            title="Booking widget"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
