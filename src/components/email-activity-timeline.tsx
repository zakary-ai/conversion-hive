import { useQuery } from "@tanstack/react-query";
import { getLeadEmailActivity } from "@/lib/api/cl.functions";
import { Mail, CheckCircle2, Clock, XCircle, Ban, MailWarning, Flag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  message_id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

const TEMPLATE_LABELS: Record<string, string> = {
  "booking-received": "Booking received",
  "booking-confirmation": "Zoom link / confirmation",
  "closer-call-closer": "Assigned to closer",
  "closer-call-prospect": "Call with prospect",
  "closer-call-prospect-reminder": "Prospect reminder",
  "closer-invite": "Closer invite",
  "setter-invite": "Setter invite",
  "admin-invite": "Admin invite",
};

function statusMeta(status: string) {
  switch (status) {
    case "sent":
      return { label: "Delivered", icon: CheckCircle2, cls: "bg-success/15 text-success" };
    case "pending":
      return { label: "Queued", icon: Clock, cls: "bg-muted text-muted-foreground" };
    case "failed":
    case "dlq":
      return { label: "Failed", icon: XCircle, cls: "bg-destructive/15 text-destructive" };
    case "suppressed":
      return { label: "Suppressed", icon: Ban, cls: "bg-warning/15 text-warning" };
    case "bounced":
      return { label: "Bounced", icon: MailWarning, cls: "bg-destructive/15 text-destructive" };
    case "complained":
      return { label: "Complained", icon: Flag, cls: "bg-destructive/15 text-destructive" };
    default:
      return { label: status, icon: Mail, cls: "bg-muted text-muted-foreground" };
  }
}

const fmt = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

export function EmailActivityTimeline({
  leadId,
  appointmentId,
  extraEmail,
}: {
  leadId?: string | null;
  appointmentId?: string | null;
  extraEmail?: string | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["email-activity", leadId ?? null, appointmentId ?? null, extraEmail ?? null],
    queryFn: () => getLeadEmailActivity({ data: { leadId, appointmentId, extraEmail } }),
    enabled: !!(leadId || appointmentId || extraEmail),
    staleTime: 30_000,
  });

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Email activity</div>
      </div>

      {isLoading ? (
        <div className="py-3 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-muted-foreground">No emails sent yet.</div>
      ) : (
        <ul className="space-y-2">
          {(data as Row[]).map((r) => {
            const meta = statusMeta(r.status);
            const Icon = meta.icon;
            const label = TEMPLATE_LABELS[r.template_name] || r.template_name;
            return (
              <li key={r.message_id} className="flex items-start gap-2 text-sm">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0", meta.cls)}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{label}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {fmt(r.created_at)} · {r.recipient_email}
                  </div>
                  {r.error_message && (
                    <div className="text-xs text-destructive mt-0.5 break-words">{r.error_message}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}
