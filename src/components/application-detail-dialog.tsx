import { useQuery } from "@tanstack/react-query";
import { getApplicationById } from "@/lib/api/b2c.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export function ApplicationDetailDialog({
  applicationId,
  open,
  onOpenChange,
}: {
  applicationId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => getApplicationById({ data: { id: applicationId! } }),
    enabled: !!applicationId && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Application</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="py-8 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}
        {data && (
          <div className="space-y-3 text-sm">
            <Row label="Name" value={data.full_name} />
            <Row label="Email" value={data.email} />
            <Row label="Phone" value={data.phone} />
            <Row label="Current monthly income" value={data.current_monthly_income} />
            <Row label="Desired monthly income" value={data.desired_monthly_income} />
            <Row label="Credit score range" value={data.credit_score_range} />
            <Row
              label="Referred by"
              value={(() => {
                const d = data as { referred_by?: string | null; dm_setter?: { full_name: string | null; email: string | null } | null };
                if (d.dm_setter) {
                  const name = d.dm_setter.full_name || d.dm_setter.email || "DM setter";
                  return `${name} (DM setter)`;
                }
                return d.referred_by ?? null;
              })()}
            />
            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              Submitted {new Date(data.created_at as string).toLocaleString()}
            </div>
          </div>
        )}
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
