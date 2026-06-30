import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Mail, Clock, Loader2, CreditCard, DollarSign, Trash2 } from "lucide-react";
import { listClosers, assignCloserToBooking, deleteCloserBooking, getApplicationById } from "@/lib/api/b2c.functions";
import { listB2bClosers } from "@/lib/api/b2b-closers.functions";
import { assignB2bCloser, deleteAppointment } from "@/lib/api/cl.functions";
import { toast } from "sonner";

export type ScheduledLeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  scheduled_at: string;
  context: string | null;
  application_id?: string | null;
};

export function ScheduledLeadDialog({
  row,
  channel,
  onClose,
}: {
  row: ScheduledLeadRow | null;
  channel: "b2b" | "b2c";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [closerId, setCloserId] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (row) {
      setCloserId("");
      setConfirmDelete(false);
    }
  }, [row?.id]);

  const closersQ = useQuery({
    queryKey: ["closers"],
    queryFn: () => listClosers(),
    enabled: !!row,
  });

  const appQ = useQuery({
    queryKey: ["application", row?.application_id],
    queryFn: () => getApplicationById({ data: { id: row!.application_id! } }),
    enabled: !!row && channel === "b2c" && !!row.application_id,
  });

  const eligibleClosers = (closersQ.data ?? []).filter((c) =>
    channel === "b2b" ? c.b2b_active && c.active : c.active,
  );

  const assign = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("No booking");
      if (!closerId) throw new Error("Pick a closer");
      if (channel === "b2b") {
        return assignB2bCloser({ data: { appointment_id: row.id, closer_id: closerId } });
      }
      return assignCloserToBooking({ data: { booking_id: row.id, closer_id: closerId } });
    },
    onSuccess: () => {
      toast.success("Closer assigned — confirmation email sent");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["b2c-bookings"] });
      qc.invalidateQueries({ queryKey: ["b2b-bookings"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("No booking");
      if (channel === "b2b") {
        return deleteAppointment({ data: { id: row.id } });
      }
      return deleteCloserBooking({ data: { booking_id: row.id } });
    },
    onSuccess: () => {
      toast.success("Lead deleted");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["b2c-bookings"] });
      qc.invalidateQueries({ queryKey: ["b2b-bookings"] });
      setConfirmDelete(false);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dt = row ? new Date(row.scheduled_at) : null;


  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row?.name ?? "Scheduled lead"}</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1.5">
              {dt && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {dt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
              )}
              {row.phone && (
                <a href={`tel:${row.phone}`} className="flex items-center gap-2 text-primary">
                  <Phone className="h-3.5 w-3.5" /> {row.phone}
                </a>
              )}
              {row.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {row.email}
                </div>
              )}
              {row.context && (
                <div className="pt-2 border-t border-border/60 text-muted-foreground whitespace-pre-wrap">{row.context}</div>
              )}
            </div>

            {channel === "b2c" && row.application_id && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Application</div>
                {appQ.isLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : appQ.data ? (
                  <>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Income now:</span>
                      <span className="font-medium">{appQ.data.current_monthly_income}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Credit:</span>
                      <span className="font-medium">{appQ.data.credit_score_range}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">Application not found.</div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Assign to closer</label>
              <Select value={closerId} onValueChange={setCloserId} disabled={closersQ.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={closersQ.isLoading ? "Loading closers…" : "Select a closer"} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleClosers.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      No {channel === "b2b" ? "B2B-active" : "active"} closers available.
                    </div>
                  ) : (
                    eligibleClosers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} <span className="text-muted-foreground">· {c.email}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Assigning creates the Zoom meeting on the closer's account and emails the lead the join link.
              </p>
            </div>

            <div className="flex justify-between items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={del.isPending}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete lead
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={() => assign.mutate()} disabled={!closerId || assign.isPending}>
                  {assign.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Assign closer
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the booking{channel === "b2c" ? " and its calendar event" : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); del.mutate(); }}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
