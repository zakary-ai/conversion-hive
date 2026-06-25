import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listMyCloserCommissions } from "@/lib/api/b2c.functions";
import { meQueryOptions } from "@/routes/app/_authenticated/route";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/closer/commissions")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.isCloser && !me.isAdmin) throw redirect({ to: "/app/dashboard" });
  },
  component: CloserCommissions,
});

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CloserCommissions() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-closer-commissions"],
    queryFn: () => listMyCloserCommissions(),
  });
  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { closed: 0, deposit: 0, commission: 0, approved: 0, pending: 0 };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-semibold">My commissions</h1>
        <p className="text-sm text-muted-foreground">Pending commissions are awaiting admin approval before they're confirmed.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="Approved" value={money(totals.approved)} accent="text-success" />
        <StatCard label="Pending approval" value={money(totals.pending)} accent="text-warning" />
        <StatCard label="Total" value={money(totals.commission)} />
      </div>

      <div className="grid gap-2">
        {isLoading && <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>}
        {!isLoading && rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No commissions yet — close a deal to start earning.</Card>
        )}
        {rows.map((r) => {
          const date = r.outcome_at ? new Date(r.outcome_at).toLocaleDateString() : "—";
          const base = r.outcome === "closed"
            ? Number(r.deal_amount ?? 0)
            : Number(r.deposit_amount ?? 0) + Number(r.follow_up_amount ?? 0);
          const isApproved = (r.commission_status ?? "pending") === "approved";
          return (
            <Card key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {isApproved
                    ? <CheckCircle2 className="h-4 w-4 text-success" />
                    : <Clock className="h-4 w-4 text-warning" />}
                  {r.applicant_name}
                  <Badge variant="secondary" className="capitalize text-[10px]">{r.outcome}</Badge>
                  {isApproved
                    ? <Badge className="text-[10px] bg-success/15 text-success border-success/30">Approved</Badge>
                    : <Badge className="text-[10px] bg-warning/15 text-warning border-warning/30">Pending approval</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {date} · Deal {money(base)} {r.commission_percent ? `· ${r.commission_percent}%` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Commission</div>
                <div className={`text-lg font-semibold ${isApproved ? "text-success" : "text-warning"}`}>
                  {money(r.commission_amount)}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        <DollarSign className="h-3 w-3" /> {label}
      </div>
      <div className={`text-2xl font-display font-semibold mt-1 ${accent ?? ""}`}>{value}</div>
    </Card>
  );
}
