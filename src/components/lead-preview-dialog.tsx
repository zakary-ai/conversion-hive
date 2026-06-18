import { useQuery } from "@tanstack/react-query";
import { getApplicationById } from "@/lib/api/b2c.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarClock, Mail, Phone, Video } from "lucide-react";

type Booking = {
  id: string;
  application_id: string | null;
  slot_start: string;
  status: string;
  zoom_join_url: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
};

export function LeadPreviewDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["application", booking?.application_id],
    queryFn: () => getApplicationById({ data: { id: booking?.application_id! } }),
    enabled: !!booking?.application_id && open,
  });

  if (!booking) return null;

  const dt = new Date(booking.slot_start);
  const label = dt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{booking.applicant_name}</span>
            <Badge variant="secondary">{booking.status}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              {label}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              {booking.applicant_email}
            </div>
            {booking.applicant_phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                {booking.applicant_phone}
              </div>
            )}
            {booking.zoom_join_url && (
              <a href={booking.zoom_join_url} target="_blank" rel="noreferrer">
                <Button size="sm" className="gap-1 mt-1">
                  <Video className="h-3 w-3" /> Join Zoom
                </Button>
              </a>
            )}
          </div>

          {booking.application_id ? (
            isLoading ? (
              <div className="py-4 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : data ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Application details</div>
                <Row label="Current income" value={data.current_monthly_income} />
                <Row label="Desired income" value={data.desired_monthly_income} />
                <Row label="Open to invest" value={data.open_to_invest} />
                <Row label="Credit score" value={data.credit_score_range} />
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Why remote sales</div>
                  <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3">
                    {data.why_remote_sales}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                  Submitted {new Date(data.created_at as string).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No application details.</div>
            )
          ) : (
            <div className="text-sm text-muted-foreground">No application linked to this booking.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="break-words">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
