import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui-bits";
import { getLead } from "@/lib/api/cl.functions";
import { Building2, Phone, Mail, Tag, Clock, CalendarClock, CheckCircle2, Video, Ban, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
};

export function AppointmentDetailDialog({ appt, onClose }: { appt: Appt | null; onClose: () => void }) {
  const { data: lead } = useQuery({
    queryKey: ["lead", appt?.lead_id],
    queryFn: () => getLead({ data: { id: appt!.lead_id! } }),
    enabled: !!appt?.lead_id,
  });

  const fmt = (s?: string | null) =>
    s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        {appt && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span>{appt.name}</span>
                {lead && <StatusPill status={lead.status} />}
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{appt.type}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 mt-2">
              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                <Row icon={CalendarClock} label="Scheduled" value={fmt(appt.scheduled_at)} />
                {appt.meeting_url && (
                  <Row icon={Video} label="Meeting" value={
                    <a href={appt.meeting_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Join</a>
                  } />
                )}
                <Row icon={Phone} label="Phone" value={appt.phone ? <a href={`tel:${appt.phone}`} className="text-primary font-medium">{appt.phone}</a> : "—"} />
                <Row icon={Mail} label="Email" value={appt.email || "—"} />
                {appt.context && <Row icon={User} label="Context" value={<span className="whitespace-pre-wrap text-right">{appt.context}</span>} />}
              </div>

              {lead ? (
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Lead profile</div>
                  <div className="rounded-lg border border-border divide-y divide-border text-sm">
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
                        <div className="text-sm whitespace-pre-wrap">{lead.notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : appt.lead_id ? (
                <div className="text-xs text-muted-foreground">Loading lead…</div>
              ) : (
                <div className="text-xs text-muted-foreground">No lead linked to this appointment.</div>
              )}
            </div>
          </>
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
