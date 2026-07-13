import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAccountDeletionRequests, resolveAccountDeletionRequest } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserX, Check, X } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/admin/account-deletions")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["account-deletion-requests"],
      queryFn: () => listAccountDeletionRequests(),
    }),
  component: AccountDeletionsPage,
});

type Row = Awaited<ReturnType<typeof listAccountDeletionRequests>>[number];

function AccountDeletionsPage() {
  const listFn = useServerFn(listAccountDeletionRequests);
  const { data: rows } = useSuspenseQuery({
    queryKey: ["account-deletion-requests"],
    queryFn: () => listFn(),
  });
  const qc = useQueryClient();
  const resolveFn = useServerFn(resolveAccountDeletionRequest);
  const [dialog, setDialog] = useState<{ row: Row; action: "approve" | "reject" } | null>(null);
  const [notes, setNotes] = useState("");

  const resolve = useMutation({
    mutationFn: () =>
      resolveFn({
        data: {
          request_id: dialog!.row.id,
          action: dialog!.action,
          admin_notes: notes.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(dialog!.action === "approve" ? "Account deleted" : "Request rejected");
      setDialog(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["account-deletion-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Account deletion requests"
        description={`${pending.length} pending`}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pending</h2>
        {pending.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">No pending requests.</Card>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.full_name || r.email || r.user_id}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Requested {new Date(r.created_at).toLocaleString()}
                    </div>
                    {r.reason && (
                      <div className="mt-3 text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3">
                        {r.reason}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setDialog({ row: r, action: "reject" }); setNotes(""); }}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" /> Reject
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { setDialog({ row: r, action: "approve" }); setNotes(""); }}
                    >
                      <UserX className="h-3.5 w-3.5 mr-1.5" /> Approve & delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">History</h2>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">User</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Requested</th>
                  <th className="text-left p-3">Resolved</th>
                  <th className="text-left p-3">Admin notes</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3">
                      <div className="font-medium">{r.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email || r.user_id}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant={r.status === "approved" ? "destructive" : "secondary"}>
                        {r.status === "approved" ? (
                          <><Check className="h-3 w-3 mr-1" /> Approved</>
                        ) : (
                          <><X className="h-3 w-3 mr-1" /> Rejected</>
                        )}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-muted-foreground">
                      {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground max-w-md whitespace-pre-wrap">{r.admin_notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === "approve"
                ? `Permanently delete ${dialog?.row.full_name || dialog?.row.email}?`
                : `Reject deletion request?`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {dialog?.action === "approve" && (
              <p className="text-sm text-muted-foreground">
                This removes their login, profile, and personal data. This cannot be undone.
              </p>
            )}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional, visible to user)"
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant={dialog?.action === "approve" ? "destructive" : "default"}
              onClick={() => resolve.mutate()}
              disabled={resolve.isPending}
            >
              {resolve.isPending
                ? "Working…"
                : dialog?.action === "approve"
                ? "Delete account"
                : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
