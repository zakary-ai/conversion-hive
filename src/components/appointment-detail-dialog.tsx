import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getLead, getMe, setAppointmentOutcome } from "@/lib/api/cl.functions";
import { Building2, Phone, Mail, Tag, Clock, CalendarClock, CheckCircle2, Video, Ban, User, XCircle, RotateCcw, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Appt = {
  id: string;
  lead_id: string | null;
  type: string;
  scheduled_at: string;
  name: string;
  phone: string | null;
  email: string | null;
  context: string | null;
  meeting_url: string | null;
  outcome?: string | null;
  deal_amount?: number | string | null;
  commission_amount?: number | string | null;
  lost_reason?: string | null;
};

export function AppointmentDetailDialog({ appt, onClose }: { appt: Appt | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: lead } = useQuery({
    queryKey: ["lead", appt?.lead_id],
    queryFn: () => getLead({ data: { id: appt!.lead_id! } }),
    enabled: !!appt?.lead_id,
  });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });

  const fmt = (s?: string | null) =>
    s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  const showOutcome = !!(me?.isAdmin || me?.isCloser) && appt?.type === "booking";
  const [mode, setMode] = useState<"none" | "closed" | "lost" | "no_show">("none");
  const [deal, setDeal] = useState("");
  const [commission, setCommission] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!appt) return;
    setMode("none");
    setDeal(appt.deal_amount != null ? String(appt.deal_amount) : "");
    setCommission(appt.commission_amount != null ? String(appt.commission_amount) : "");
    setReason(appt.lost_reason ?? "");
  }, [appt?.id]);

  const mutation = useMutation({
    mutationFn: (input: { id: string; outcome: "closed"; deal_amount: number; commission_amount: number } | { id: string; outcome: "lost"; lost_reason?: string } | { id: string; outcome: "no_show" } | { id: string; outcome: "clear" }) =>
      setAppointmentOutcome({ data: input }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["my-appointments"] });
      qc.invalidateQueries({ queryKey: ["all-appointments"] });
      qc.invalidateQueries({ queryKey: ["commissions"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      setMode("none");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitClosed = () => {
    const d = parseFloat(deal);
    const c = parseFloat(commission);
    if (!isFinite(d) || d < 0) return toast.error("Enter a valid deal amount");
    if (!isFinite(c) || c < 0) return toast.error("Enter a valid commission");
    mutation.mutate({ id: appt!.id, outcome: "closed", deal_amount: d, commission_amount: c });
  };
  const submitLost = () => {
    mutation.mutate({ id: appt!.id, outcome: "lost", lost_reason: reason.trim() });
  };

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100vw-1rem)] sm:w-full max-h-[92vh] overflow-y-auto overflow-x-hidden">
        {appt && (
          <div className="min-w-0 max-w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="truncate max-w-full">{appt.name}</span>
                {lead && <StatusPill status={lead.status} />}
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{appt.type}</span>
                {appt.outcome === "closed" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/15 text-success uppercase tracking-wider">Closed</span>
                )}
                {appt.outcome === "lost" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/15 text-destructive uppercase tracking-wider">Lost</span>
                )}
                {appt.outcome === "no_show" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning uppercase tracking-wider">No show</span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 mt-2 min-w-0">
              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                <Row icon={CalendarClock} label="Scheduled" value={fmt(appt.scheduled_at)} />
                {appt.meeting_url && (
                  <Row icon={Video} label="Meeting" value={
                    <a href={appt.meeting_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Join</a>
                  } />
                )}
                <Row icon={Phone} label="Phone" value={appt.phone ? <a href={`tel:${appt.phone}`} className="text-primary font-medium">{appt.phone}</a> : "—"} />
                <Row icon={Mail} label="Email" value={appt.email || "—"} />
                {appt.context && <Row icon={User} label="Context" value={<span className="block whitespace-pre-wrap break-words text-right">{appt.context}</span>} />}
              </div>

              {showOutcome && (
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">Outcome</div>
                    {appt.outcome && mode === "none" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => mutation.mutate({ id: appt.id, outcome: "clear" })}
                        disabled={mutation.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
                      </Button>
                    )}
                  </div>

                  {appt.outcome && mode === "none" ? (
                    <div className="space-y-2">
                      {appt.outcome === "closed" && (
                        <div className="rounded-md bg-success/10 border border-success/30 p-3 space-y-1.5">
                          <div className="flex items-center gap-2 text-success font-medium">
                            <CheckCircle2 className="h-4 w-4" /> Deal closed
                          </div>
                          <div className="text-sm flex justify-between"><span className="text-muted-foreground">Deal amount</span><span className="font-medium">${Number(appt.deal_amount ?? 0).toFixed(2)}</span></div>
                          <div className="text-sm flex justify-between"><span className="text-muted-foreground">Setter commission</span><span className="font-medium">${Number(appt.commission_amount ?? 0).toFixed(2)}</span></div>
                        </div>
                      )}
                      {appt.outcome === "lost" && (
                        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 space-y-1.5">
                          <div className="flex items-center gap-2 text-destructive font-medium">
                            <XCircle className="h-4 w-4" /> Marked lost
                          </div>
                          {appt.lost_reason && (
                            <div className="text-sm whitespace-pre-wrap break-words text-muted-foreground">{appt.lost_reason}</div>
                          )}
                        </div>
                      )}
                      {appt.outcome === "no_show" && (
                        <div className="rounded-md bg-warning/10 border border-warning/30 p-3">
                          <div className="flex items-center gap-2 text-warning font-medium">
                            <UserX className="h-4 w-4" /> Lead did not show
                          </div>
                        </div>
                      )}
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setMode(appt.outcome === "lost" ? "lost" : appt.outcome === "no_show" ? "no_show" : "closed")}>
                        Edit outcome
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant={mode === "closed" ? "default" : "outline"}
                          onClick={() => setMode("closed")}
                          className={cn(mode === "closed" && "bg-success hover:bg-success/90 text-success-foreground")}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Closed
                        </Button>
                        <Button
                          size="sm"
                          variant={mode === "lost" ? "default" : "outline"}
                          onClick={() => setMode("lost")}
                          className={cn(mode === "lost" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Lost
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => mutation.mutate({ id: appt.id, outcome: "no_show" })}
                          disabled={mutation.isPending}
                          className="bg-warning/10 hover:bg-warning/20 text-warning border-warning/30"
                        >
                          <UserX className="h-4 w-4 mr-1" /> No show
                        </Button>
                        {appt.outcome && mode !== "none" && (
                          <Button size="sm" variant="ghost" onClick={() => setMode("none")}>
                            Cancel
                          </Button>
                        )}
                      </div>

                      {mode === "closed" && (
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor="deal" className="text-xs">Deal amount ($)</Label>
                            <Input id="deal" type="number" min="0" step="0.01" value={deal} onChange={(e) => setDeal(e.target.value)} placeholder="0.00" />
                          </div>
                          <div>
                            <Label htmlFor="commission" className="text-xs">Setter commission ($)</Label>
                            <Input id="commission" type="number" min="0" step="0.01" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0.00" />
                          </div>
                          <Button onClick={submitClosed} disabled={mutation.isPending} className="w-full">
                            Save closed deal
                          </Button>
                        </div>
                      )}

                      {mode === "lost" && (
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor="reason" className="text-xs">Why lost?</Label>
                            <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason..." maxLength={2000} />
                          </div>
                          <Button onClick={submitLost} disabled={mutation.isPending} variant="destructive" className="w-full">
                            Mark as lost
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {appt.lead_id ? (
                <details className="rounded-lg border border-border group">
                  <summary className="px-3 py-2 cursor-pointer flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground list-none [&::-webkit-details-marker]:hidden">
                    <span>Lead profile</span>
                    <span className="text-[10px] text-muted-foreground group-open:hidden">Tap to open</span>
                    <span className="text-[10px] text-muted-foreground hidden group-open:inline">Tap to close</span>
                  </summary>
                  {lead ? (
                    <div className="border-t border-border divide-y divide-border text-sm">
                      <Row icon={Building2} label="Company" value={lead.company || "—"} />
                      <Row icon={Tag} label="Source" value={lead.source || "—"} />
                      <Row icon={Clock} label="Added" value={fmt(lead.created_at)} />
                      <Row icon={CheckCircle2} label="Last contacted" value={fmt(lead.contacted_at)} />
                      <Row icon={CalendarClock} label="Callback at" value={fmt(lead.callback_at)} />
                      {lead.do_not_contact && (
                        <Row icon={Ban} label="Do not contact" value={<span className="text-destructive font-medium">Yes</span>} />
                      )}
                      {lead.notes && (
                        <div className="px-3 py-2">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
                          <div className="text-sm whitespace-pre-wrap break-words">{lead.notes}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">Loading lead…</div>
                  )}
                </details>
              ) : (
                <div className="text-xs text-muted-foreground">No lead linked to this appointment.</div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="text-xs uppercase tracking-wider text-muted-foreground w-28 shrink-0">{label}</div>
      <div className="text-sm flex-1 min-w-0 truncate text-right">{value}</div>
    </div>
  );
}
