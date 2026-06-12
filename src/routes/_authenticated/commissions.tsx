import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyCommissions } from "@/lib/api/cl.functions";
import { PageHeader, StatCard } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

const opts = queryOptions({ queryKey: ["my-commissions"], queryFn: () => listMyCommissions() });

export const Route = createFileRoute("/_authenticated/commissions")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: CommissionsPage,
});

function CommissionsPage() {
  const { data: entries } = useSuspenseQuery(opts);
  const total = entries.reduce((s, e) => s + Number(e.amount), 0);
  const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString();

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Commissions" description="Your earnings and entries logged by your team." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Total earned" value={fmtMoney(total)} icon={DollarSign} />
        <StatCard label="Entries" value={entries.length} />
      </div>

      {/* Mobile: stacked cards */}
      <div className="space-y-2 sm:hidden">
        {entries.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No commissions yet.</Card>
        )}
        {entries.map((e) => (
          <Card key={e.id} className="p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-success">{fmtMoney(Number(e.amount))}</span>
              <span className="text-xs text-muted-foreground">{fmtDate(e.created_at)}</span>
            </div>
            {e.note && <div className="mt-1 text-xs text-muted-foreground break-words">{e.note}</div>}
          </Card>
        ))}
      </div>

      {/* Tablet+ : table */}
      <Card className="hidden overflow-hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Note</th></tr>
          </thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No commissions yet.</td></tr>}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-3 text-muted-foreground">{fmtDate(e.created_at)}</td>
                <td className="p-3 font-medium text-success">{fmtMoney(Number(e.amount))}</td>
                <td className="p-3 text-muted-foreground">{e.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
