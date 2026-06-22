import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { notificationsQueryOptions } from "@/components/notifications-bell";
import { approveLeadRequest, dismissLeadRequest } from "@/lib/api/lead-requests.functions";
import { toast } from "sonner";
import { Users } from "lucide-react";

type LeadRequestData = {
  requester_user_id?: string;
  requester_name?: string;
  requested_count?: number;
};

export function LeadRequestNotifier() {
  const qc = useQueryClient();
  const { data } = useQuery(notificationsQueryOptions);
  const items = data?.items ?? [];
  const pending = items.find((n) => n.type === "lead_request" && !n.read_at);

  const approveFn = useServerFn(approveLeadRequest);
  const dismissFn = useServerFn(dismissLeadRequest);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { notification_id: id } }),
    onSuccess: (res) => {
      toast.success(
        res.assigned > 0
          ? `Sent ${res.assigned} leads`
          : "No unassigned leads were available",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { notification_id: id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (!pending) return null;
  const payload = (pending.data ?? {}) as LeadRequestData;
  const name = payload.requester_name ?? "A setter";
  const count = payload.requested_count ?? 75;
  const busy = approve.isPending || dismiss.isPending;

  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) dismiss.mutate(pending.id); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </span>
            Lead request
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm">
          <p>
            <span className="font-medium">{name}</span> has worked through their list and is requesting more leads.
          </p>
          <p className="mt-2 text-muted-foreground">
            Approving will assign up to <span className="font-medium text-foreground">{count}</span> unassigned leads to them.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => dismiss.mutate(pending.id)}>
            Dismiss
          </Button>
          <Button disabled={busy} onClick={() => approve.mutate(pending.id)}>
            {approve.isPending ? "Sending…" : `Approve ${count} leads`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
