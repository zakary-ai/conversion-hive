import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { logCallOutcome } from "@/lib/api/b2b-pool.functions";
import { BookingIframeDialog } from "@/components/booking-iframe-dialog";
import { toast } from "sonner";
import { CalendarClock, PhoneOff, Ban, CheckCircle2 } from "lucide-react";

type Lead = { id: string; first_name: string | null; last_name: string | null };

export function LogCallOutcomeDialog({
  lead, open, onClose,
}: { lead: Lead; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"menu" | "callback" | "note" | "booking">("menu");
  const [pendingOutcome, setPendingOutcome] = useState<"no_answer" | "not_interested" | null>(null);
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState<string>("");

  const reset = () => { setMode("menu"); setNote(""); setCallbackAt(""); setPendingOutcome(null); };
  const close = () => { reset(); onClose(); };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
    qc.invalidateQueries({ queryKey: ["my-didnt-pick-up"] });
    qc.invalidateQueries({ queryKey: ["my-callbacks"] });
    qc.invalidateQueries({ queryKey: ["pool-lead", lead.id] });
  };

  type Payload = {
    pool_lead_id: string;
    outcome: "booked" | "callback_scheduled" | "no_answer" | "not_interested";
    note?: string;
    callback_at?: string;
  };
  const submit = useMutation({
    mutationFn: async (payload: Payload) => logCallOutcome({ data: payload }),
    onSuccess: () => { toast.success("Outcome logged"); invalidate(); close(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "lead";

  return (
    <>
      <Dialog open={open && mode !== "booking"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log call outcome</DialogTitle></DialogHeader>

          {mode === "menu" && (
            <div className="grid gap-2">
              <Button className="justify-start" onClick={() => setMode("booking")}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Book
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setMode("callback")}>
                <CalendarClock className="h-4 w-4 mr-2" /> Schedule callback
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => { setPendingOutcome("no_answer"); setMode("note"); }}>
                <PhoneOff className="h-4 w-4 mr-2" /> Didn't pick up
              </Button>
              <Button variant="destructive" className="justify-start" onClick={() => { setPendingOutcome("not_interested"); setMode("note"); }}>
                <Ban className="h-4 w-4 mr-2" /> Not interested / Burn lead
              </Button>
            </div>
          )}

          {mode === "callback" && (
            <div className="space-y-3">
              <div>
                <Label>When to call back</Label>
                <Input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}

          {mode === "note" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {pendingOutcome === "no_answer"
                  ? `Log a "didn't pick up" attempt for ${name}. They'll show up in your Didn't Pick Up queue.`
                  : `Mark ${name} as not interested. This burns the lead.`}
              </p>
              <div>
                <Label>Note (optional)</Label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}

          {mode !== "menu" && (
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Back</Button>
              {mode === "callback" && (
                <Button
                  disabled={!callbackAt || submit.isPending}
                  onClick={() => submit.mutate({
                    pool_lead_id: lead.id,
                    outcome: "callback_scheduled",
                    callback_at: new Date(callbackAt).toISOString(),
                    note: note || undefined,
                  })}
                >Save callback</Button>
              )}
              {mode === "note" && pendingOutcome && (
                <Button
                  disabled={submit.isPending}
                  variant={pendingOutcome === "not_interested" ? "destructive" : "default"}
                  onClick={() => submit.mutate({
                    pool_lead_id: lead.id,
                    outcome: pendingOutcome,
                    note: note || undefined,
                  })}
                >Confirm</Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <BookingIframeDialog
        open={open && mode === "booking"}
        leadName={name}
        onClose={() => {
          // Ask if booking went through
          const confirmed = typeof window !== "undefined" && window.confirm("Did the booking go through?");
          if (confirmed) {
            submit.mutate({ pool_lead_id: lead.id, outcome: "booked", note: undefined });
          } else {
            setMode("menu");
          }
        }}
      />
    </>
  );
}
